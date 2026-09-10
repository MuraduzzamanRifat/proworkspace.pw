'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getDb } from '@/db'
import { products } from '@/db/schema'
import { bool, guard, requestIp, str, withMessage } from '@/lib/admin-guard'
import { recordAudit } from '@/services/admin-auth'

const BACK = '/admin/products'

/**
 * Product text and deliverable labels. Keys and filenames are fixed in code
 * because they are part of the download URLs and the file map; the words
 * shown to the buyer are the admin's.
 */
export async function updateProduct(formData: FormData): Promise<void> {
  const admin = await guard('commerce.manage', BACK)
  const id = str(formData, 'id', 64)
  const title = str(formData, 'title', 200)
  const subtitle = str(formData, 'subtitle', 300)
  const isActive = bool(formData, 'isActive')
  if (!id || !title) redirect(withMessage(BACK, 'error', 'পণ্যের নাম খালি রাখা যাবে না।') as never)

  const db = getDb()
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1)
  const before = rows[0]
  if (!before) redirect(withMessage(BACK, 'error', 'পণ্যটি পাওয়া যায়নি।') as never)

  const deliverables = before.deliverables.map((d) => ({
    key: d.key,
    filename: d.filename,
    label: str(formData, `label_${d.key}`, 200) || d.label,
    detail: str(formData, `detail_${d.key}`, 300),
  }))

  await db.update(products).set({ title, subtitle, isActive, deliverables, updatedAt: new Date() }).where(eq(products.id, id))
  await recordAudit({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'product.updated',
    entityType: 'product',
    entityId: id,
    before: { title: before.title, subtitle: before.subtitle, isActive: before.isActive, deliverables: before.deliverables },
    after: { title, subtitle, isActive, deliverables },
    ip: await requestIp(),
  })
  revalidatePath('/')
  revalidatePath('/checkout')
  redirect(withMessage(BACK, 'msg', 'পণ্য সংরক্ষিত।') as never)
}
