'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { getDb } from '@/db'
import { coupons } from '@/db/schema'
import { guard, requestIp, str, takaField, withMessage } from '@/lib/admin-guard'
import { isUniqueViolation } from '@/lib/db-errors'
import { recordAudit } from '@/services/admin-auth'

const BACK = '/admin/coupons'

export async function createCoupon(formData: FormData): Promise<void> {
  const admin = await guard('commerce.manage', BACK)
  const code = str(formData, 'code', 64).toUpperCase().replace(/[^A-Z0-9_-]/g, '')
  const kind = str(formData, 'kind', 16) === 'fixed' ? 'fixed' : 'percent'
  const minOrder = takaField(formData, 'minOrder') ?? 0
  const maxRaw = str(formData, 'maxRedemptions', 16)
  const maxRedemptions = maxRaw === '' ? null : Number(maxRaw)
  const expiresRaw = str(formData, 'expiresAt', 32)
  const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59+06:00`) : null

  let value: number
  if (kind === 'percent') {
    value = Number(str(formData, 'value', 16))
    if (!Number.isInteger(value) || value < 1 || value > 100) redirect(withMessage(BACK, 'error', 'শতাংশ ১ থেকে ১০০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।') as never)
  } else {
    const v = takaField(formData, 'value')
    if (v === null || v <= 0) redirect(withMessage(BACK, 'error', 'নির্দিষ্ট ছাড় শূন্যের বেশি টাকা হতে হবে।') as never)
    value = v
  }
  if (code.length < 3) redirect(withMessage(BACK, 'error', 'কুপন কোড অন্তত ৩ অক্ষরের (A-Z, 0-9) হতে হবে।') as never)
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) redirect(withMessage(BACK, 'error', 'ব্যবহারের সীমা একটি ধনাত্মক পূর্ণসংখ্যা হতে হবে।') as never)
  if (expiresAt && Number.isNaN(expiresAt.getTime())) redirect(withMessage(BACK, 'error', 'মেয়াদের তারিখ সঠিক নয়।') as never)

  try {
    const rows = await getDb()
      .insert(coupons)
      .values({ code, kind, value, minOrderPoisha: minOrder, maxRedemptions, expiresAt, isActive: true })
      .returning({ id: coupons.id })
    await recordAudit({
      actorId: admin.userId,
      actorEmail: admin.email,
      action: 'coupon.created',
      entityType: 'coupon',
      entityId: rows[0]?.id ?? code,
      after: { code, kind, value, minOrderPoisha: minOrder, maxRedemptions, expiresAt: expiresAt?.toISOString() ?? null },
      ip: await requestIp(),
    })
  } catch (err) {
    if (isUniqueViolation(err)) redirect(withMessage(BACK, 'error', `কোড "${code}" আগে থেকেই আছে।`) as never)
    throw err
  }
  redirect(withMessage(BACK, 'msg', `কুপন ${code} তৈরি হয়েছে।`) as never)
}

export async function setCouponActive(formData: FormData): Promise<void> {
  const admin = await guard('commerce.manage', BACK)
  const id = str(formData, 'id', 64)
  const active = str(formData, 'active', 8) === '1'
  const db = getDb()
  const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1)
  const before = rows[0]
  if (!before) redirect(withMessage(BACK, 'error', 'কুপনটি পাওয়া যায়নি।') as never)
  await db.update(coupons).set({ isActive: active, updatedAt: new Date() }).where(eq(coupons.id, id))
  await recordAudit({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: active ? 'coupon.activated' : 'coupon.deactivated',
    entityType: 'coupon',
    entityId: id,
    before: { isActive: before.isActive },
    after: { isActive: active },
    ip: await requestIp(),
  })
  redirect(withMessage(BACK, 'msg', `${before.code} ${active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`) as never)
}
