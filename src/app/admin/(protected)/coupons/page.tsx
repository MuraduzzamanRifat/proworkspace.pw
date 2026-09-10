import { desc, eq } from 'drizzle-orm'

import { Flash, btnCls, btnGhost, inputCls } from '@/components/admin/Flash'
import { getDb } from '@/db'
import { coupons, featureFlags } from '@/db/schema'
import { formatBdt, poisha } from '@/domain/money'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { createCoupon, setCouponActive } from './actions'

export const dynamic = 'force-dynamic'

export default async function CouponsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, admin] = await Promise.all([searchParams, getCurrentAdmin()])
  const canManage = admin ? can(admin.role, 'commerce.manage') : false
  const db = getDb()
  const [rows, flag] = await Promise.all([
    db.select().from(coupons).orderBy(desc(coupons.createdAt)),
    db.select({ enabled: featureFlags.enabled }).from(featureFlags).where(eq(featureFlags.key, 'coupons_enabled')).limit(1),
  ])
  const fieldShown = flag[0]?.enabled ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">কুপন</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          ছাড় সার্ভারে হিসাব হয়; ক্রেতা শুধু কোডটি দেন।{' '}
          {fieldShown ? 'চেকআউটে কুপনের ঘর দেখানো হচ্ছে।' : 'চেকআউটে কুপনের ঘর এখন লুকানো — সেটিংসে "কুপন" চালু করুন।'}
        </p>
      </div>
      <Flash params={params} />

      {canManage && (
        <form action={createCoupon} className="grid gap-3 rounded-xl border border-[--color-line] bg-[--color-surface] p-5 sm:grid-cols-3">
          <label className="sm:col-span-1">
            <span className="mb-1 block text-sm font-semibold">কোড</span>
            <input name="code" className={inputCls} placeholder="LAUNCH20" required minLength={3} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold">ধরন</span>
            <select name="kind" className={inputCls} defaultValue="percent">
              <option value="percent">শতাংশ ছাড়</option>
              <option value="fixed">নির্দিষ্ট টাকা ছাড়</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold">মান</span>
            <input name="value" type="number" step="0.01" min="0" className={inputCls} placeholder="২০ (%) বা ১০০ (টাকা)" required />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold">ন্যূনতম অর্ডার (টাকা)</span>
            <input name="minOrder" type="number" step="0.01" min="0" className={inputCls} placeholder="0" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold">সর্বোচ্চ ব্যবহার</span>
            <input name="maxRedemptions" type="number" min="1" className={inputCls} placeholder="খালি = সীমাহীন" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold">মেয়াদ (Dhaka)</span>
            <input name="expiresAt" type="date" className={inputCls} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" className={btnCls}>
              কুপন তৈরি করুন
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-[--color-line]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[--color-surface] text-[--color-muted]">
            <tr>
              <th className="px-4 py-3 font-medium">কোড</th>
              <th className="px-4 py-3 font-medium">ছাড়</th>
              <th className="px-4 py-3 font-medium">ন্যূনতম</th>
              <th className="px-4 py-3 font-medium">ব্যবহার</th>
              <th className="px-4 py-3 font-medium">মেয়াদ</th>
              <th className="px-4 py-3 font-medium">অবস্থা</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[--color-muted]">
                  কোনো কুপন নেই।
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[--color-line]">
                <td className="px-4 py-3 font-mono">{c.code}</td>
                <td className="px-4 py-3">{c.kind === 'percent' ? `${c.value}%` : formatBdt(poisha(c.value))}</td>
                <td className="px-4 py-3">{c.minOrderPoisha > 0 ? formatBdt(poisha(c.minOrderPoisha)) : '—'}</td>
                <td className="px-4 py-3">
                  {c.timesRedeemed}
                  {c.maxRedemptions !== null && ` / ${c.maxRedemptions}`}
                </td>
                <td className="px-4 py-3 text-[--color-muted]">{c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : '—'}</td>
                <td className="px-4 py-3">{c.isActive ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</td>
                <td className="px-4 py-3 text-right">
                  {canManage && (
                    <form action={setCouponActive}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={c.isActive ? '0' : '1'} />
                      <button type="submit" className={btnGhost}>
                        {c.isActive ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
