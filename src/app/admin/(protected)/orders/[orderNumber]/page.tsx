import Link from 'next/link'
import { notFound } from 'next/navigation'

import { formatBdt, poisha } from '@/domain/money'
import { STATE_LABELS_BN } from '@/domain/order-state'
import { getCurrentAdmin, hasAtLeast } from '@/lib/session'
import { getOrderDetail } from '@/services/orders-admin'
import { RecordRefund, ResendDelivery, ToggleDownload } from './OrderActions'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>
}) {
  const { orderNumber } = await params
  const [order, admin] = await Promise.all([getOrderDetail(orderNumber), getCurrentAdmin()])

  if (!order || !admin) notFound()

  const canManage = hasAtLeast(admin.role, 'admin')
  const refundableTaka = Math.max(0, (order.totalPoisha - order.refundedPoisha) / 100)
  const activeGrant = order.grants.find((g) => g.revokedAt === null)
  const hasGrant = order.grants.length > 0

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/orders" className="text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← সব অর্ডার
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-mono text-2xl">{order.orderNumber}</h1>
          <span className="rounded-full border border-[--color-line] px-3 py-1 text-sm">
            {STATE_LABELS_BN[order.status]}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="ক্রেতা">
            <Row label="নাম" value={order.name || '—'} />
            <Row label="ইমেইল" value={order.email} />
            <Row label="ফোন" value={order.phone || '—'} />
          </Card>

          <Card title="আইটেম">
            {order.items.map((i) => (
              <div key={i.productSku} className="border-b border-[--color-line] pb-3 last:border-0 last:pb-0">
                <p className="font-semibold">{i.productTitle}</p>
                <p className="text-sm text-[--color-muted]">{i.offerLabel}</p>
                <p className="mt-1 text-sm text-[--color-muted]">
                  {i.quantity} × {formatBdt(poisha(i.unitPricePoisha))} ={' '}
                  {formatBdt(poisha(i.lineTotalPoisha))}
                </p>
                <p className="mt-1 font-mono text-xs text-[--color-line-strong]">{i.productSku}</p>
              </div>
            ))}
          </Card>

          <Card title="হিসাব">
            <Row label="সাবটোটাল" value={formatBdt(poisha(order.subtotalPoisha))} />
            {order.discountPoisha > 0 && (
              <Row
                label={`ছাড়${order.couponCode ? ` (${order.couponCode})` : ''}`}
                value={`−${formatBdt(poisha(order.discountPoisha))}`}
              />
            )}
            {order.taxPoisha > 0 && <Row label="ভ্যাট" value={formatBdt(poisha(order.taxPoisha))} />}
            <Row label="মোট" value={formatBdt(poisha(order.totalPoisha))} strong />
            {order.refundedPoisha > 0 && (
              <Row label="ফেরত" value={`−${formatBdt(poisha(order.refundedPoisha))}`} />
            )}
          </Card>

          <Card title="পেমেন্ট">
            {order.payments.length === 0 ? (
              <p className="text-sm text-[--color-muted]">কোনো পেমেন্ট রেকর্ড নেই।</p>
            ) : (
              order.payments.map((p) => (
                <div key={p.invoiceId} className="border-b border-[--color-line] pb-3 last:border-0 last:pb-0">
                  <Row label="গেটওয়ে" value={p.provider} />
                  <Row label="ইনভয়েস" value={p.invoiceId} mono />
                  {p.transactionId && <Row label="ট্রানজেকশন" value={p.transactionId} mono />}
                  <Row label="মাধ্যম" value={p.method || '—'} />
                  {p.senderNumber && <Row label="প্রেরকের নম্বর" value={p.senderNumber} />}
                  <Row label="গেটওয়ে অবস্থা" value={p.gatewayStatus || '—'} />
                  <Row label="গেটওয়ে পরিমাণ" value={formatBdt(poisha(p.amountPoisha))} />
                  {p.feePoisha > 0 && <Row label="ফি" value={formatBdt(poisha(p.feePoisha))} />}
                  <Row
                    label="যাচাই"
                    value={p.verifiedAt ? p.verifiedAt.toISOString().slice(0, 16).replace('T', ' ') : 'হয়নি'}
                  />
                </div>
              ))
            )}
          </Card>

          {order.downloadHistory.length > 0 && (
            <Card title="ডাউনলোড ইতিহাস">
              <ul className="space-y-2 text-sm">
                {order.downloadHistory.map((h, idx) => (
                  <li key={`${h.createdAt.toISOString()}-${idx}`} className="flex justify-between gap-3">
                    <span className={h.succeeded ? 'text-[--color-success]' : 'text-[--color-danger]'}>
                      {h.succeeded ? 'সফল' : `ব্যর্থ (${h.reason})`}
                    </span>
                    <span className="text-[--color-muted]">
                      {h.ipAddress} · {h.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {Object.keys(order.attribution).length > 0 && (
            <Card title="অ্যাট্রিবিউশন">
              <dl className="space-y-1 text-sm">
                {Object.entries(order.attribution).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-[--color-muted]">{k}</dt>
                    {/* Attacker-controlled text. React escapes it; it is never
                        rendered as HTML. */}
                    <dd className="break-all text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="সময়রেখা">
            <Row label="তৈরি" value={fmt(order.createdAt)} />
            <Row label="পেমেন্ট" value={fmt(order.paidAt)} />
            <Row label="ডেলিভারি" value={fmt(order.fulfilledAt)} />
            <Row label="ফেরত" value={fmt(order.refundedAt)} />
          </Card>

          <Card title="ডাউনলোড অনুমতি">
            {!hasGrant ? (
              <p className="text-sm text-[--color-muted]">কোনো অনুমতি তৈরি হয়নি।</p>
            ) : (
              order.grants.map((g) => (
                <div key={g.id} className="text-sm">
                  <Row label="অবস্থা" value={g.revokedAt ? 'বাতিল' : 'সক্রিয়'} />
                  <Row
                    label="ডাউনলোড"
                    value={`${g.downloadCount}${g.maxDownloads === null ? '' : ` / ${g.maxDownloads}`}`}
                  />
                  <Row label="মেয়াদ" value={fmt(g.expiresAt)} />
                </div>
              ))
            )}
          </Card>

          <Card title="ব্যবস্থা">
            <div className="space-y-5">
              <ResendDelivery orderNumber={order.orderNumber} />

              {canManage && hasGrant && (
                <ToggleDownload
                  orderNumber={order.orderNumber}
                  currentlyRevoked={activeGrant === undefined}
                />
              )}

              {canManage ? (
                <div className="border-t border-[--color-line] pt-5">
                  <h3 className="mb-3 text-sm font-semibold">ফেরত রেকর্ড</h3>
                  <RecordRefund
                    orderNumber={order.orderNumber}
                    maxRefundableTaka={refundableTaka}
                  />
                </div>
              ) : (
                <p className="border-t border-[--color-line] pt-5 text-sm text-[--color-muted]">
                  ফেরত রেকর্ড করতে অ্যাডমিন অনুমতি প্রয়োজন।
                </p>
              )}
            </div>
          </Card>

          {order.audit.length > 0 && (
            <Card title="কার্যবিবরণী">
              <ul className="space-y-2 text-xs">
                {order.audit.map((a, idx) => (
                  <li key={`${a.createdAt.toISOString()}-${idx}`}>
                    <span className="font-mono">{a.action}</span>
                    <span className="block text-[--color-muted]">
                      {a.actorEmail} · {fmt(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') : '—'
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string
  value: string
  strong?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-[--color-muted]">{label}</span>
      <span className={`text-right ${strong ? 'font-bold' : ''} ${mono ? 'break-all font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}
