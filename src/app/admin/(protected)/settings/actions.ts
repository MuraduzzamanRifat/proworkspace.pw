'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getDb } from '@/db'
import { featureFlags, settings } from '@/db/schema'
import { bool, guard, requestIp, str, withMessage } from '@/lib/admin-guard'
import { recordAudit } from '@/services/admin-auth'

const BACK = '/admin/settings'

/**
 * Only settings that code actually reads are exposed here:
 *   support_email          → footer contact fallback and delivery-help copy
 *   download_max_per_order → cap written onto each new download grant
 *   sticky_cta_enabled     → mobile sticky buy bar on the landing page
 *   coupons_enabled        → coupon field on the checkout form
 */
export async function updateSettings(formData: FormData): Promise<void> {
  const admin = await guard('settings.manage', BACK)
  const supportEmail = str(formData, 'support_email', 254).toLowerCase()
  const maxRaw = str(formData, 'download_max_per_order', 8)
  const downloadMax = maxRaw === '' ? null : Number(maxRaw)
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) redirect(withMessage(BACK, 'error', 'সহায়তার ইমেইল সঠিক নয়।') as never)
  if (downloadMax !== null && (!Number.isInteger(downloadMax) || downloadMax < 1 || downloadMax > 1000)) redirect(withMessage(BACK, 'error', 'ডাউনলোড সীমা ১ থেকে ১০০০-এর মধ্যে পূর্ণসংখ্যা, বা খালি।') as never)

  const flags = { sticky_cta_enabled: bool(formData, 'sticky_cta_enabled'), coupons_enabled: bool(formData, 'coupons_enabled') }
  const db = getDb()

  const beforeSettings = Object.fromEntries((await db.select().from(settings)).map((r) => [r.key, r.value]))
  const beforeFlags = Object.fromEntries((await db.select().from(featureFlags)).map((r) => [r.key, r.enabled]))

  await db.transaction(async (tx) => {
    await tx.insert(settings).values({ key: 'support_email', value: supportEmail, label: 'সহায়তার ইমেইল' }).onConflictDoUpdate({ target: settings.key, set: { value: supportEmail, updatedAt: new Date() } })
    await tx
      .insert(settings)
      .values({ key: 'download_max_per_order', value: downloadMax === null ? null : downloadMax, label: 'প্রতি অর্ডারে সর্বোচ্চ ডাউনলোড' })
      .onConflictDoUpdate({ target: settings.key, set: { value: downloadMax === null ? null : downloadMax, updatedAt: new Date() } })
    for (const [key, enabled] of Object.entries(flags)) {
      await tx.update(featureFlags).set({ enabled, updatedAt: new Date() }).where(eq(featureFlags.key, key))
    }
  })

  await recordAudit({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'settings.updated',
    entityType: 'settings',
    entityId: 'general',
    before: { support_email: beforeSettings['support_email'], download_max_per_order: beforeSettings['download_max_per_order'], ...beforeFlags },
    after: { support_email: supportEmail, download_max_per_order: downloadMax, ...flags },
    ip: await requestIp(),
  })
  revalidatePath('/')
  revalidatePath('/checkout')
  redirect(withMessage(BACK, 'msg', 'সেটিংস সংরক্ষিত। লাইভ পেজ ও চেকআউট হালনাগাদ হয়েছে।') as never)
}
