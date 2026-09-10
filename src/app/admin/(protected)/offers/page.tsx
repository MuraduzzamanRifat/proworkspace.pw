import { asc, eq } from 'drizzle-orm'

import { Flash, btnCls, inputCls } from '@/components/admin/Flash'
import { getDb } from '@/db'
import { offers, products } from '@/db/schema'
import { formatBdt, poisha } from '@/domain/money'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { updateOffer } from './actions'

export const dynamic = 'force-dynamic'

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, admin] = await Promise.all([searchParams, getCurrentAdmin()])
  const canManage = admin ? can(admin.role, 'commerce.manage') : false
  const rows = await getDb()
    .select({
      id: offers.id,
      code: offers.code,
      label: offers.label,
      price: offers.pricePoisha,
      list: offers.listPricePoisha,
      isActive: offers.isActive,
      isDefault: offers.isDefault,
      productTitle: products.title,
    })
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.id))
    .orderBy(asc(offers.sortOrder))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">অফার ও বান্ডেল</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          এখানকার দামই ক্রেতাকে চার্জ করা হয়। ল্যান্ডিং পেজ ও চেকআউট এই সংখ্যা থেকে পড়ে; পেজের লেখা বদলালে দাম বদলায় না।
        </p>
      </div>
      <Flash params={params} />

      <div className="space-y-4">
        {rows.map((o) => (
          <form key={o.id} action={updateOffer} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
            <input type="hidden" name="id" value={o.id} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-xs text-[--color-muted]">
                {o.code} · {o.productTitle}
              </p>
              <p className="text-sm">
                বর্তমানে: <strong>{formatBdt(poisha(o.price))}</strong>
                {o.list > o.price && <span className="ml-2 text-[--color-muted] line-through">{formatBdt(poisha(o.list))}</span>}
              </p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-semibold">লেবেল</span>
                <input name="label" defaultValue={o.label} className={inputCls} disabled={!canManage} required />
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold">বিক্রয়মূল্য (টাকা)</span>
                <input name="price" type="number" step="0.01" min="0" defaultValue={(o.price / 100).toFixed(2)} className={inputCls} disabled={!canManage} required />
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold">তালিকা মূল্য (টাকা)</span>
                <input name="listPrice" type="number" step="0.01" min="0" defaultValue={(o.list / 100).toFixed(2)} className={inputCls} disabled={!canManage} required />
                <span className="mt-1 block text-xs text-[--color-muted]">আলাদা কিনলে কত হতো। বিক্রয়মূল্যের সমান হলে কোনো "সাশ্রয়" দেখাবে না।</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={o.isActive} disabled={!canManage} /> সক্রিয়
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={o.isDefault} disabled={!canManage} /> ডিফল্ট (পেজে এটিই দেখাবে)
              </label>
            </div>
            {canManage ? (
              <button type="submit" className={`${btnCls} mt-4`}>
                সংরক্ষণ করুন
              </button>
            ) : (
              <p className="mt-4 text-xs text-[--color-muted]">দাম বদলাতে অ্যাডমিন অনুমতি লাগে।</p>
            )}
          </form>
        ))}
      </div>
    </div>
  )
}
