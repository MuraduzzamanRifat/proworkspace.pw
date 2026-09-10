import Link from 'next/link'

import { missingPolicies } from '@/config/site'
import { formatBdt, poisha } from '@/domain/money'
import { STATE_LABELS_BN } from '@/domain/order-state'
import { emailConfigured, paymentsConfigured, serverEnv } from '@/config/env'
import { getDashboardMetrics, getHealthAlerts, getRecentOrders } from '@/services/metrics'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawDays = Array.isArray(params['days']) ? params['days'][0] : params['days']
  const rangeDays = [7, 30, 90, 365].includes(Number(rawDays)) ? Number(rawDays) : 30

  const [metrics, alerts, recent] = await Promise.all([
    getDashboardMetrics(rangeDays),
    getHealthAlerts(),
    getRecentOrders(15),
  ])

  const blockers = buildLaunchBlockers()

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl">ড্যাশবোর্ড</h1>
        <nav aria-label="সময়সীমা" className="flex gap-2 text-sm">
          {[7, 30, 90, 365].map((d) => (
            <Link
              key={d}
              href={`/admin?days=${d}`}
              className={`rounded-lg border px-3 py-1.5 ${
                d === rangeDays
                  ? 'border-[--color-accent] text-[--color-ink]'
                  : 'border-[--color-line] text-[--color-muted] hover:border-[--color-line-strong]'
              }`}
            >
              {d} দিন
            </Link>
          ))}
        </nav>
      </div>

      {blockers.length > 0 && (
        <section
          aria-labelledby="blockers"
          className="rounded-2xl border border-[--color-warning] bg-[--color-surface] p-5"
        >
          <h2 id="blockers" className="font-semibold text-[--color-warning]">
            লঞ্চের আগে যা করতে হবে
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-[--color-muted]">
            {blockers.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        </section>
      )}

      {alerts.length > 0 && (
        <section aria-label="সতর্কতা" className="space-y-2">
          {alerts.map((a) => (
            <p
              key={a.message}
              className={`rounded-xl border px-4 py-3 text-sm ${
                a.severity === 'critical'
                  ? 'border-[--color-danger] text-[--color-danger]'
                  : 'border-[--color-warning] text-[--color-warning]'
              }`}
            >
              {a.message}
            </p>
          ))}
        </section>
      )}

      <section aria-label="সংখ্যা" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="নিট আয়" value={formatBdt(poisha(metrics.netRevenuePoisha))} />
        <Tile label="অর্ডার" value={String(metrics.orderCount)} />
        <Tile label="গড় অর্ডার মূল্য" value={formatBdt(poisha(metrics.averageOrderValuePoisha))} />
        <Tile
          label="চেকআউট সম্পন্নের হার"
          value={
            metrics.checkoutCompletionRate === null
              ? '—'
              : `${Math.round(metrics.checkoutCompletionRate * 100)}%`
          }
        />
        <Tile label="ফেরত" value={formatBdt(poisha(metrics.refundedPoisha))} sub={`${metrics.refundedOrders}টি অর্ডার`} />
        <Tile label="পেমেন্ট ব্যর্থ" value={String(metrics.paymentFailures)} />
        <Tile label="অসম্পূর্ণ চেকআউট" value={String(metrics.abandonedCheckouts)} />
        <Tile
          label="ট্র্যাকিং সারি"
          value={String(metrics.pendingTrackingEvents)}
          sub={metrics.failedTrackingEvents > 0 ? `${metrics.failedTrackingEvents}টি ব্যর্থ` : undefined}
        />
      </section>

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="text-lg font-semibold">
            সাম্প্রতিক অর্ডার
          </h2>
          <Link href="/admin/orders" className="text-sm text-[--color-muted] hover:text-[--color-ink]">
            সব দেখুন →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-6 text-center text-sm text-[--color-muted]">
            এখনো কোনো অর্ডার নেই।
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[--color-line]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-[--color-surface] text-[--color-muted]">
                <tr>
                  <Th>অর্ডার</Th>
                  <Th>ক্রেতা</Th>
                  <Th>অবস্থা</Th>
                  <Th align="right">পরিমাণ</Th>
                  <Th>তারিখ</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-t border-[--color-line]">
                    <Td>
                      <span className="font-mono">{o.orderNumber}</span>
                    </Td>
                    <Td>
                      <span className="block">{o.name || '—'}</span>
                      <span className="text-xs text-[--color-muted]">{o.email}</span>
                    </Td>
                    <Td>{STATE_LABELS_BN[o.status]}</Td>
                    <Td align="right">{formatBdt(poisha(o.totalPoisha))}</Td>
                    <Td>
                      <time dateTime={o.createdAt.toISOString()}>
                        {o.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                      </time>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Configuration and content that must exist before taking real money.
 * Surfaced here rather than in a document so it cannot be forgotten.
 */
function buildLaunchBlockers(): string[] {
  const out: string[] = []

  for (const p of missingPolicies()) {
    out.push(`"${p.title}" পেজটি এখনো লেখা হয়নি।`)
  }
  if (!paymentsConfigured()) {
    out.push('পেমেন্ট গেটওয়ের API কী সেট করা হয়নি — চেকআউট কাজ করবে না।')
  }
  if (!emailConfigured()) {
    out.push('ইমেইল প্রোভাইডার সেট করা হয়নি — ডেলিভারি ইমেইল যাবে না।')
  }
  if (!serverEnv().EBOOK_FILE_URL) {
    out.push('বইয়ের ফাইলের ঠিকানা সেট করা হয়নি — ডাউনলোড কাজ করবে না।')
  }
  if (!serverEnv().ADMIN_ALERT_EMAIL) {
    out.push('অ্যাডমিন সতর্কতার ইমেইল সেট করা হয়নি।')
  }

  return out
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4">
      <p className="text-sm text-[--color-muted]">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[--color-muted]">{sub}</p>}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th scope="col" className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <td className={`px-4 py-3 ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
}
