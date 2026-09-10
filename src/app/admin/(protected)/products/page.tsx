import { Flash, btnCls, inputCls } from '@/components/admin/Flash'
import { productFileUrl } from '@/config/env'
import { getDb } from '@/db'
import { products } from '@/db/schema'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { updateProduct } from './actions'

export const dynamic = 'force-dynamic'

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, admin] = await Promise.all([searchParams, getCurrentAdmin()])
  const canManage = admin ? can(admin.role, 'commerce.manage') : false
  const rows = await getDb().select().from(products)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">পণ্য</h1>
        <p className="mt-1 text-sm text-[--color-muted]">নাম, উপনাম ও ফাইলের লেবেল। ফাইলগুলো নিজে (ঠিকানা) এনভায়রনমেন্টে থাকে, এখানে নয়।</p>
      </div>
      <Flash params={params} />

      {rows.map((p) => (
        <form key={p.id} action={updateProduct} className="space-y-4 rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
          <input type="hidden" name="id" value={p.id} />
          <p className="font-mono text-xs text-[--color-muted]">
            SKU {p.sku} · slug {p.slug}
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">নাম</span>
            <input name="title" defaultValue={p.title} className={inputCls} disabled={!canManage} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">উপনাম</span>
            <input name="subtitle" defaultValue={p.subtitle} className={inputCls} disabled={!canManage} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={p.isActive} disabled={!canManage} /> বিক্রির জন্য সক্রিয়
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">ক্রেতা যা পান</legend>
            {p.deliverables.map((d) => (
              <div key={d.key} className="rounded-lg border border-[--color-line] p-3">
                <p className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs text-[--color-muted]">
                  {d.key} · {d.filename}
                  {productFileUrl(d.key) ? (
                    <span className="rounded-full border border-[--color-success] px-2 py-0.5 text-[--color-success]">ফাইল সেট আছে</span>
                  ) : (
                    <span className="rounded-full border border-[--color-danger] px-2 py-0.5 text-[--color-danger]">ফাইল সেট নেই</span>
                  )}
                </p>
                <input name={`label_${d.key}`} defaultValue={d.label} className={`${inputCls} mb-2`} disabled={!canManage} placeholder="লেবেল" />
                <input name={`detail_${d.key}`} defaultValue={d.detail} className={inputCls} disabled={!canManage} placeholder="এক লাইনের বিবরণ" />
              </div>
            ))}
          </fieldset>

          {canManage && (
            <button type="submit" className={btnCls}>
              সংরক্ষণ করুন
            </button>
          )}
        </form>
      ))}
    </div>
  )
}
