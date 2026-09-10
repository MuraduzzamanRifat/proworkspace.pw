import { desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'

import { getDb } from '@/db'
import { downloadGrants, orders } from '@/db/schema'
import { formatBdt, poisha } from '@/domain/money'
import { isEntitled, STATE_LABELS_BN, type OrderState } from '@/domain/order-state'
import { verifyToken } from '@/lib/crypto'
import { isConfigError, serverEnv } from '@/config/env'
import { PurchaseEvent } from '@/components/Analytics'
import { buildDownloadLinks, TOKEN_KIND_RECEIPT } from '@/services/fulfilment'

export const metadata: Metadata = {
  title: 'ধন্যবাদ',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

/**
 * The page a paying customer lands on.
 *
 * Access is by short-lived signed token, not by order number. The order number
 * appears on receipts and in support conversations, so it must not be the
 * thing that unlocks the product.
 */
export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params['t']
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''

  if (!token) return <Problem body="লিংকটি অসম্পূর্ণ। ইমেইলে পাঠানো লিংকটি ব্যবহার করুন।" />

  let orderId: string
  try {
    const payload = verifyToken(token, serverEnv().DOWNLOAD_SECRET)
    if (payload['kind'] !== TOKEN_KIND_RECEIPT) throw new Error('wrong token kind')
    orderId = payload.sub
  } catch {
    return (
      <Problem body="এই লিংকের মেয়াদ শেষ হয়েছে। আপনার ইমেইলে পাঠানো ডাউনলোড লিংকটি ব্যবহার করুন।" />
    )
  }

  let rows: Array<{
    orderNumber: string
    status: OrderState
    email: string
    name: string
    total: number
    grantPublicId: string | null
    revokedAt: Date | null
  }>
  try {
    const db = getDb()
    rows = await db
      .select({
        orderNumber: orders.orderNumber,
        status: orders.status,
        email: orders.email,
        name: orders.name,
        total: orders.totalPoisha,
        grantPublicId: downloadGrants.publicId,
        revokedAt: downloadGrants.revokedAt,
      })
      .from(orders)
      .leftJoin(downloadGrants, eq(downloadGrants.orderId, orders.id))
      .where(eq(orders.id, orderId))
      .orderBy(desc(downloadGrants.createdAt))
      .limit(1)
  } catch (err) {
    // Unconfigured deployment: say so rather than crash. A real customer can
    // only reach this page after a payment, which cannot happen in that state.
    if (isConfigError(err)) {
      return <Problem body="সাইটটি এখনো সম্পূর্ণ চালু হয়নি। একটু পরে আবার চেষ্টা করুন।" />
    }
    throw err
  }

  const order = rows[0]
  if (!order) return <Problem body="অর্ডারটি খুঁজে পাওয়া যায়নি।" />

  const entitled = isEntitled(order.status)
  const downloads =
    entitled && order.grantPublicId && !order.revokedAt
      ? buildDownloadLinks(order.grantPublicId)
      : []

  return (
    <main id="main" className="px-5 py-16 sm:py-24">
      <div className="mx-auto max-w-lg text-center">
        <p aria-hidden className="text-4xl">
          ✅
        </p>
        <h1 className="mt-4 text-2xl sm:text-3xl">
          ধন্যবাদ{order.name ? `, ${order.name}` : ''}!
        </h1>

        {entitled ? (
          <p className="mt-3 text-[--color-muted]">
            আপনার পেমেন্ট সম্পন্ন হয়েছে। প্রতিটি ফাইল এখনই ডাউনলোড করুন — একই লিংকগুলো আপনার
            ইমেইলেও পাঠানো হয়েছে।
          </p>
        ) : (
          <p className="mt-3 text-[--color-muted]">
            আপনার অর্ডারের অবস্থা: <strong>{STATE_LABELS_BN[order.status]}</strong>. পেমেন্ট নিশ্চিত
            হলে ডাউনলোড লিংক ইমেইলে পাঠানো হবে।
          </p>
        )}

        {downloads.length > 0 && (
          <ul className="mx-auto mt-8 max-w-sm space-y-3">
            {downloads.map((d) => (
              <li key={d.key}>
                <a
                  href={d.url}
                  className="block rounded-xl bg-[--color-cta] px-6 py-4 font-semibold text-white hover:bg-[--color-cta-hover]"
                >
                  {d.label}
                </a>
              </li>
            ))}
          </ul>
        )}

        <dl className="mx-auto mt-10 max-w-sm space-y-2 rounded-2xl border border-[--color-line] bg-[--color-surface] p-5 text-left text-sm">
          <Row label="অর্ডার নম্বর" value={order.orderNumber} />
          <Row label="ইমেইল" value={order.email} />
          <Row label="পরিশোধিত" value={formatBdt(poisha(order.total))} />
        </dl>

        <p className="mt-6 text-sm text-[--color-muted]">
          ইমেইল না পেলে স্প্যাম ফোল্ডার দেখুন। সমস্যা হলে অর্ডার নম্বর দিয়ে যোগাযোগ করুন।
        </p>

        <Link href="/" className="mt-8 inline-block text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← হোমপেজে ফিরুন
        </Link>
      </div>

      {entitled && (
        <PurchaseEvent
          // Identical to the id queued for the Conversions API in
          // settlePayment, so Meta counts one sale rather than two.
          eventId={`purchase-${orderId}`}
          valueBdt={order.total / 100}
          orderNumber={order.orderNumber}
        />
      )}
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[--color-muted]">{label}</dt>
      <dd className="font-semibold text-[--color-ink]">{value}</dd>
    </div>
  )
}

function Problem({ body }: { body: string }) {
  return (
    <main id="main" className="px-5 py-20">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl">লিংকটি কাজ করছে না</h1>
        <p className="mt-4 text-[--color-muted]">{body}</p>
        <Link href="/" className="mt-8 inline-block text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← হোমপেজে ফিরুন
        </Link>
      </div>
    </main>
  )
}
