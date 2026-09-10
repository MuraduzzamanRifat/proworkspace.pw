import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { getDb } from '@/db'
import { orderItems, orders, payments } from '@/db/schema'
import { formatBdt, poisha } from '@/domain/money'
import { ORDER_STATES, STATE_LABELS_BN, type OrderState } from '@/domain/order-state'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = first(params['q'])
  const statusParam = first(params['status'])
  const page = Math.max(1, Number(first(params['page']) || '1') || 1)

  const status = ORDER_STATES.includes(statusParam as OrderState)
    ? (statusParam as OrderState)
    : null

  const db = getDb()
  const conditions: SQL[] = []

  if (status) conditions.push(eq(orders.status, status))
  if (query) {
    // ilike is a sequential scan on a large table. Acceptable here: this is a
    // single-product funnel and the row count is in the thousands, not
    // millions. Revisit with a trigram index if that stops being true.
    const like = `%${query}%`
    const match = or(
      ilike(orders.email, like),
      ilike(orders.orderNumber, like),
      ilike(orders.name, like),
      ilike(orders.phone, like),
    )
    if (match) conditions.push(match)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      email: orders.email,
      name: orders.name,
      phone: orders.phone,
      status: orders.status,
      totalPoisha: orders.totalPoisha,
      refundedPoisha: orders.refundedPoisha,
      couponCode: orders.couponCode,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      offerLabel: orderItems.offerLabel,
      paymentMethod: payments.paymentMethod,
      invoiceId: payments.gatewayInvoiceId,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE)

  const hasNext = rows.length > PAGE_SIZE
  const visible = rows.slice(0, PAGE_SIZE)

  const totalRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(where)
  const total = totalRows[0]?.n ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl">অর্ডার</h1>
        <p className="text-sm text-[--color-muted]">মোট {total}টি</p>
      </div>

      <form method="get" className="flex flex-wrap gap-3">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="ইমেইল, নাম, ফোন বা অর্ডার নম্বর"
          aria-label="অর্ডার খুঁজুন"
          className="min-w-56 flex-1 rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-2.5 text-sm"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          aria-label="অবস্থা"
          className="rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-2.5 text-sm"
        >
          <option value="">সব অবস্থা</option>
          {ORDER_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS_BN[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-[--color-cta] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[--color-cta-hover]"
        >
          খুঁজুন
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-8 text-center text-sm text-[--color-muted]">
          কোনো অর্ডার পাওয়া যায়নি।
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[--color-line]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[--color-surface] text-[--color-muted]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">অর্ডার</th>
                <th scope="col" className="px-4 py-3 font-medium">ক্রেতা</th>
                <th scope="col" className="px-4 py-3 font-medium">অফার</th>
                <th scope="col" className="px-4 py-3 font-medium">অবস্থা</th>
                <th scope="col" className="px-4 py-3 font-medium">পেমেন্ট</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">পরিমাণ</th>
                <th scope="col" className="px-4 py-3 font-medium">তারিখ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} className="border-t border-[--color-line] align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${o.orderNumber}`}
                      className="font-mono text-[--color-accent] hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    {o.couponCode && (
                      <span className="mt-1 block text-xs text-[--color-accent]">
                        কুপন: {o.couponCode}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">{o.name || '—'}</span>
                    <span className="block text-xs text-[--color-muted]">{o.email}</span>
                    {o.phone && (
                      <span className="block text-xs text-[--color-muted]">{o.phone}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">{o.offerLabel ?? '—'}</td>
                  <td className="px-4 py-3">{STATE_LABELS_BN[o.status]}</td>
                  <td className="px-4 py-3 text-xs text-[--color-muted]">
                    <span className="block">{o.paymentMethod || '—'}</span>
                    {o.invoiceId && <span className="block font-mono">{o.invoiceId}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatBdt(poisha(o.totalPoisha))}
                    {o.refundedPoisha > 0 && (
                      <span className="mt-1 block text-xs text-[--color-danger]">
                        −{formatBdt(poisha(o.refundedPoisha))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[--color-muted]">
                    <time dateTime={o.createdAt.toISOString()}>
                      {o.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="পাতা" className="flex justify-between text-sm">
        {page > 1 ? (
          <Link href={pageUrl(query, status, page - 1)} className="text-[--color-muted] hover:text-[--color-ink]">
            ← আগের পাতা
          </Link>
        ) : (
          <span />
        )}
        {hasNext ? (
          <Link href={pageUrl(query, status, page + 1)} className="text-[--color-muted] hover:text-[--color-ink]">
            পরের পাতা →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  )
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ''
  return value?.trim() ?? ''
}

/**
 * Returned as a UrlObject rather than a template string because `typedRoutes`
 * validates href against the real route tree, and a computed string cannot be
 * proven to be a valid route at compile time.
 */
function pageUrl(q: string, status: OrderState | null, page: number) {
  const query: Record<string, string> = { page: String(page) }
  if (q) query['q'] = q
  if (status) query['status'] = status
  return { pathname: '/admin/orders' as const, query }
}
