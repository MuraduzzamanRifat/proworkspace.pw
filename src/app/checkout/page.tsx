import type { Metadata } from 'next'
import Link from 'next/link'

import { CheckoutForm } from '@/components/CheckoutForm'
import { PAYMENT_METHODS_ADVERTISED } from '@/config/site'
import { formatBdt } from '@/domain/money'
import { getCatalogue } from '@/services/catalogue'

/** A checkout page must never be indexed, and must never be cached. */
export const metadata: Metadata = {
  title: 'চেকআউট',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const cancelled = params['cancelled'] === '1'
  const { product, primary } = await getCatalogue()
  const priceLabel = formatBdt(primary.price)

  // Read process.env directly rather than through serverEnv(): that throws in
  // production when required variables are missing, and this page must render
  // in exactly that situation to show the notice below.
  const paymentsLive =
    Boolean(process.env.DATABASE_URL?.trim()) && Boolean(process.env.UDDOKTAPAY_API_KEY?.trim())

  return (
    <main id="main" className="px-5 py-12 sm:py-20">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← ফিরে যান
        </Link>

        <h1 className="mt-6 text-2xl sm:text-3xl">চেকআউট</h1>

        {cancelled && (
          <p
            role="status"
            className="mt-5 rounded-xl border border-[--color-warning] px-4 py-3 text-sm text-[--color-warning]"
          >
            পেমেন্ট সম্পন্ন হয়নি। আপনার কোনো টাকা কাটা হয়নি। আবার চেষ্টা করতে পারেন।
          </p>
        )}

        <section
          aria-label="অর্ডার সারাংশ"
          className="mt-6 rounded-2xl border border-[--color-line] bg-[--color-surface] p-5"
        >
          <p className="font-semibold text-[--color-ink]">{product.title}</p>
          <p className="mt-1 text-sm text-[--color-muted]">{primary.label}</p>

          <ul className="mt-4 space-y-1.5 text-sm text-[--color-muted]">
            {product.deliverables.map((d) => (
              <li key={d} className="flex gap-2">
                <span aria-hidden className="text-[--color-success]">
                  ✓
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-baseline justify-between border-t border-[--color-line] pt-4">
            <span className="text-[--color-muted]">সর্বমোট</span>
            <span className="text-2xl font-bold text-[--color-ink]">{priceLabel}</span>
          </div>
          {/* No shipping row: this is a download. Showing "shipping ৳0" on a
              digital product invites the question of where it is shipping to. */}
        </section>

        <div className="mt-8">
          {paymentsLive ? (
            <CheckoutForm
              offerCode={primary.code}
              priceLabel={priceLabel}
              paymentMethods={PAYMENT_METHODS_ADVERTISED}
            />
          ) : (
            // Deployed before the database and gateway credentials exist.
            // Better an honest notice than a form that fails on submit.
            <p
              role="status"
              className="rounded-xl border border-[--color-warning] px-4 py-4 text-sm text-[--color-warning]"
            >
              পেমেন্ট এখনো চালু হয়নি। খুব শিগগিরই চালু হবে — একটু পরে আবার আসুন।
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
