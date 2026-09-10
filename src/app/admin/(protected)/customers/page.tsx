import { desc, ilike, or, sql } from 'drizzle-orm'

import { inputCls } from '@/components/admin/Flash'
import { getDb } from '@/db'
import { customers } from '@/db/schema'
import { formatBdt, poisha } from '@/domain/money'

export const dynamic = 'force-dynamic'

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const raw = params['q']
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  const db = getDb()
  const where = q ? or(ilike(customers.email, `%${q}%`), ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`)) : undefined
  const [rows, total] = await Promise.all([
    db.select().from(customers).where(where).orderBy(desc(customers.updatedAt)).limit(100),
    db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl">ক্রেতা</h1>
        <p className="text-sm text-[--color-muted]">মোট {total[0]?.n ?? 0}</p>
      </div>
      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="ইমেইল, নাম বা ফোন" className={`${inputCls} max-w-sm`} aria-label="ক্রেতা খুঁজুন" />
        <button type="submit" className="rounded-lg bg-[--color-cta] px-4 py-2 text-sm font-semibold text-white">খুঁজুন</button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-[--color-line]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[--color-surface] text-[--color-muted]">
            <tr>
              <th className="px-4 py-3 font-medium">ক্রেতা</th>
              <th className="px-4 py-3 font-medium">ফোন</th>
              <th className="px-4 py-3 font-medium">অর্ডার</th>
              <th className="px-4 py-3 text-right font-medium">মোট খরচ</th>
              <th className="px-4 py-3 font-medium">শেষ আপডেট</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[--color-muted]">
                  কোনো ক্রেতা পাওয়া যায়নি।
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[--color-line]">
                <td className="px-4 py-3">
                  <span className="block">{c.name || '—'}</span>
                  <span className="text-xs text-[--color-muted]">{c.email}</span>
                </td>
                <td className="px-4 py-3">{c.phone || '—'}</td>
                <td className="px-4 py-3">{c.orderCount}</td>
                <td className="px-4 py-3 text-right">{formatBdt(poisha(c.totalSpentPoisha))}</td>
                <td className="px-4 py-3 text-xs text-[--color-muted]">{c.updatedAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
