'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import sharp from 'sharp'

import { getDb } from '@/db'
import { media } from '@/db/schema'
import { guard, requestIp, str, withMessage } from '@/lib/admin-guard'
import { isUniqueViolation } from '@/lib/db-errors'
import { log } from '@/lib/logger'
import { recordAudit } from '@/services/admin-auth'

const BACK = '/admin/media'
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'])
const HTTPS = /^https:\/\/[^\s<>"']+$/i

/**
 * Registering an external image URL.
 *
 * The URL is fetched once, server-side, and probed with sharp. If it is not
 * an image the admin gets told now, not by a broken picture on the live page
 * later. Only https is accepted; javascript:, data: and file: never reach
 * the fetch.
 */
export async function registerMediaUrl(formData: FormData): Promise<void> {
  const admin = await guard('media.manage', BACK)
  const url = str(formData, 'url', 2048)
  const alt = str(formData, 'alt', 200)
  if (!HTTPS.test(url)) redirect(withMessage(BACK, 'error', 'শুধু https:// ছবির লিংক গ্রহণযোগ্য।') as never)

  let bytes: Buffer
  let mime = ''
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 15_000)
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { Accept: 'image/*' } })
    clearTimeout(t)
    if (!res.ok) redirect(withMessage(BACK, 'error', `ছবিটি পাওয়া যায়নি (HTTP ${res.status})।`) as never)
    mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_BYTES) redirect(withMessage(BACK, 'error', 'ছবিটি ১৫ MB-এর বেশি; ছোট করে দিন।') as never)
    bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_BYTES) redirect(withMessage(BACK, 'error', 'ছবিটি ১৫ MB-এর বেশি; ছোট করে দিন।') as never)
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
    log.warn('media.fetch_failed', { err })
    redirect(withMessage(BACK, 'error', 'লিংকটি থেকে ছবি আনা যায়নি।') as never)
  }

  let width: number | null = null
  let height: number | null = null
  try {
    const meta = await sharp(bytes).metadata()
    width = meta.width ?? null
    height = meta.height ?? null
    if (!mime.startsWith('image/') && meta.format) mime = `image/${meta.format}`
  } catch {
    redirect(withMessage(BACK, 'error', 'এটি একটি ছবি নয় (ফরম্যাট চেনা যায়নি)।') as never)
  }
  if (!ALLOWED_MIME.has(mime)) redirect(withMessage(BACK, 'error', `এই ধরনের ফাইল (${mime || 'অজানা'}) গ্রহণযোগ্য নয়।`) as never)

  try {
    const rows = await getDb()
      .insert(media)
      .values({ url, source: 'url', filename: url.split('/').pop()?.split('?')[0] ?? '', alt, mime, width, height, bytes: bytes.length, createdBy: admin.userId })
      .returning({ id: media.id })
    await recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'media.registered', entityType: 'media', entityId: rows[0]?.id ?? url, after: { url, mime, width, height }, ip: await requestIp() })
  } catch (err) {
    if (isUniqueViolation(err)) redirect(withMessage(BACK, 'error', 'এই লিংকটি আগে থেকেই লাইব্রেরিতে আছে।') as never)
    throw err
  }
  redirect(withMessage(BACK, 'msg', `ছবি যোগ হয়েছে (${width}×${height}, ${mime}).`) as never)
}

/**
 * Upload: optimised with sharp into WebP at up to three widths and stored in
 * Vercel Blob. Requires BLOB_READ_WRITE_TOKEN; without it the form says so.
 */
export async function uploadMedia(formData: FormData): Promise<void> {
  const admin = await guard('media.manage', BACK)
  if (!process.env.BLOB_READ_WRITE_TOKEN) redirect(withMessage(BACK, 'error', 'আপলোড চালু নেই: Vercel Blob স্টোর যুক্ত করা হয়নি। আপাতত ছবির লিংক ব্যবহার করুন।') as never)

  const file = formData.get('file')
  const alt = str(formData, 'alt', 200)
  if (!(file instanceof File) || file.size === 0) redirect(withMessage(BACK, 'error', 'কোনো ফাইল বাছাই করা হয়নি।') as never)
  if (file.size > MAX_BYTES) redirect(withMessage(BACK, 'error', 'ফাইলটি ১৫ MB-এর বেশি।') as never)
  if (!ALLOWED_MIME.has(file.type) || file.type === 'image/svg+xml') redirect(withMessage(BACK, 'error', 'JPEG, PNG, WebP, AVIF বা GIF আপলোড করুন।') as never)

  const { put } = await import('@vercel/blob')
  const input = Buffer.from(await file.arrayBuffer())
  const meta = await sharp(input).metadata()
  const origW = meta.width ?? 0
  const widths = [640, 1280, 1920].filter((w) => w < origW)
  if (origW > 0) widths.push(Math.min(origW, 2400))
  const base = `media/${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, '-').replace(/\.[^.]+$/, '')}`

  const variants: Record<string, string> = {}
  for (const w of widths) {
    const out = await sharp(input).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    const blob = await put(`${base}-${w}.webp`, out, { access: 'public', contentType: 'image/webp', addRandomSuffix: false })
    variants[String(w)] = blob.url
  }
  const largest = variants[String(Math.max(...widths))]!
  const finalMeta = await sharp(input).resize({ width: Math.max(...widths), withoutEnlargement: true }).webp().toBuffer({ resolveWithObject: true })

  const rows = await getDb()
    .insert(media)
    .values({ url: largest, source: 'upload', filename: file.name, alt, mime: 'image/webp', width: finalMeta.info.width, height: finalMeta.info.height, bytes: finalMeta.info.size, variants, createdBy: admin.userId })
    .returning({ id: media.id })
  await recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'media.uploaded', entityType: 'media', entityId: rows[0]?.id ?? largest, after: { url: largest, variants: Object.keys(variants) }, ip: await requestIp() })
  redirect(withMessage(BACK, 'msg', `আপলোড সম্পন্ন: ${Object.keys(variants).length}টি সাইজে WebP তৈরি হয়েছে।`) as never)
}

export async function updateMediaAlt(formData: FormData): Promise<void> {
  const admin = await guard('media.manage', BACK)
  const id = str(formData, 'id', 64)
  const alt = str(formData, 'alt', 200)
  const db = getDb()
  const rows = await db.select({ alt: media.alt }).from(media).where(eq(media.id, id)).limit(1)
  if (!rows[0]) redirect(withMessage(BACK, 'error', 'ছবিটি পাওয়া যায়নি।') as never)
  await db.update(media).set({ alt }).where(eq(media.id, id))
  await recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'media.alt_updated', entityType: 'media', entityId: id, before: { alt: rows[0].alt }, after: { alt }, ip: await requestIp() })
  redirect(withMessage(BACK, 'msg', 'বিকল্প লেখা সংরক্ষিত।') as never)
}

export async function deleteMedia(formData: FormData): Promise<void> {
  const admin = await guard('media.manage', BACK)
  const id = str(formData, 'id', 64)
  const db = getDb()
  const rows = await db.select({ url: media.url }).from(media).where(eq(media.id, id)).limit(1)
  if (!rows[0]) redirect(withMessage(BACK, 'error', 'ছবিটি পাওয়া যায়নি।') as never)
  // Soft delete. Pages that still reference the URL keep working; the row
  // simply leaves the library. Nothing is removed from storage.
  await db.update(media).set({ deletedAt: new Date() }).where(eq(media.id, id))
  await recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'media.deleted', entityType: 'media', entityId: id, before: { url: rows[0].url }, ip: await requestIp() })
  redirect(withMessage(BACK, 'msg', 'লাইব্রেরি থেকে সরানো হয়েছে।') as never)
}
