'use server'

import { and, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getDb } from '@/db'
import { offers } from '@/db/schema'
import { bool, guard, requestIp, str, takaField, withMessage } from '@/lib/admin-guard'
import { recordAudit } from '@/services/admin-auth'

const BACK = '/admin/offers'

/**
 * Offer edits are the only place the customer-facing price changes.
 * Every write is validated as money (integer poisha, non-negative), audited
 * with before/after, and immediately revalidates the public pages. The
 * checkout never reads a price from anywhere else.
 */
export async function updateOffer(formData: FormData): Promise<void> {
  const admin = await guard('commerce.manage', BACK)
  const id = str(formData, 'id', 64)
  const label = str(formData, 'label', 200)
  const price = takaField(formData, 'price')
  const listPrice = takaField(formData, 'listPrice')
  const isActive = bool(formData, 'isActive')
  const isDefault = bool(formData, 'isDefault')

  if (!id) redirect(withMessage(BACK, 'error', 'অফার শনাক্ত করা যায়নি।') as never)
  if (!label) redirect(withMessage(BACK, 'error', 'লেবেল খালি রাখা যাবে না।') as never)
  if (price === null || listPrice === null) redirect(withMessage(BACK, 'error', 'দাম অবশ্যই শূন্য বা তার বেশি সংখ্যা হতে হবে (সর্বোচ্চ দুই দশমিক)।') as never)
  if (price === 0 && isActive) redirect(withMessage(BACK, 'error', 'সক্রিয় অফারের দাম শূন্য হতে পারে না।') as never)
  if (listPrice < price) redirect(withMessage(BACK, 'error', 'আলাদা-দামের যোগফল (তালিকা মূল্য) বিক্রয়মূল্যের চেয়ে কম হতে পারে না।') as never)

  const db = getDb()
  const rows = await db.select().from(offers).where(eq(offers.id, id)).limit(1)
  const before = rows[0]
  if (!before) redirect(withMessage(BACK, 'error', 'অফারটি পাওয়া যায়নি।') as never)

  // Never leave the shop without an active, default offer.
  if (!isActive || !isDefault) {
    const others = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(ne(offers.id, id), eq(offers.isActive, true), eq(offers.isDefault, true)))
    if (others.length === 0 && (before.isActive && before.isDefault)) {
      redirect(withMessage(BACK, 'error', 'এটিই একমাত্র সক্রিয় ডিফল্ট অফার; আগে অন্য একটি অফার ডিফল্ট করুন।') as never)
    }
  }

  await db.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(offers).set({ isDefault: false }).where(ne(offers.id, id))
    }
    await tx
      .update(offers)
      .set({ label, pricePoisha: price, listPricePoisha: listPrice, isActive, isDefault, updatedAt: new Date() })
      .where(eq(offers.id, id))
  })

  await recordAudit({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'offer.updated',
    entityType: 'offer',
    entityId: id,
    before: { label: before.label, pricePoisha: before.pricePoisha, listPricePoisha: before.listPricePoisha, isActive: before.isActive, isDefault: before.isDefault },
    after: { label, pricePoisha: price, listPricePoisha: listPrice, isActive, isDefault },
    ip: await requestIp(),
  })

  revalidatePath('/')
  revalidatePath('/checkout')
  redirect(withMessage(BACK, 'msg', `অফার "${label}" সংরক্ষিত। লাইভ পেজ ও চেকআউট হালনাগাদ হয়েছে।`) as never)
}
