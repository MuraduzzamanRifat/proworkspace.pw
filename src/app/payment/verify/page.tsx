import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { log } from '@/lib/logger'
import { verifyPayment } from '@/payments/uddoktapay'
import { buildReceiptToken, settlePayment } from '@/services/fulfilment'

export const metadata: Metadata = {
  title: 'পেমেন্ট যাচাই',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

/**
 * Where the gateway sends the customer back to.
 *
 * The browser arriving here proves only that a browser arrived. This page
 * therefore ignores every query parameter except the invoice id, and asks the
 * gateway server-side what actually happened.
 *
 * It races the webhook by design. Whichever arrives first settles the order;
 * `settlePayment` makes the loser a no-op. That redundancy is deliberate:
 * webhooks get lost, and a customer staring at a spinner is a refund request.
 */
export default async function PaymentVerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const invoiceId = firstString(params['invoice_id']) || firstString(params['invoiceId'])

  if (!invoiceId) {
    return (
      <Shell heading="পেমেন্টের তথ্য পাওয়া যায়নি">
        <p>
          আপনার পেমেন্ট সম্পন্ন হয়ে থাকলে ইমেইলে ডাউনলোড লিংক পৌঁছে যাবে। সমস্যা হলে অর্ডার নম্বর
          নিয়ে আমাদের সাথে যোগাযোগ করুন।
        </p>
      </Shell>
    )
  }

  let receiptToken: string | null = null
  let failure: { heading: string; body: string } | null = null

  try {
    const verified = await verifyPayment(invoiceId)
    const result = await settlePayment(verified, 'verify')

    switch (result.outcome) {
      case 'fulfilled':
      case 'already_processed':
        receiptToken = result.orderId ? buildReceiptToken(result.orderId) : null
        break

      case 'not_completed':
        failure = {
          heading: 'পেমেন্ট সম্পন্ন হয়নি',
          body: 'আপনার কোনো টাকা কাটা হয়নি। আবার চেষ্টা করতে পারেন।',
        }
        break

      case 'amount_mismatch':
        failure = {
          heading: 'পেমেন্ট যাচাই করা হচ্ছে',
          body:
            'আপনার পেমেন্টের পরিমাণ মিলছে না, তাই আমরা এটি হাতে যাচাই করছি। ' +
            'চিন্তার কিছু নেই — যাচাই শেষ হলে দ্রুত ইমেইলে জানানো হবে।',
        }
        break

      case 'unknown_invoice':
      default:
        failure = {
          heading: 'অর্ডারটি খুঁজে পাওয়া যায়নি',
          body: 'অনুগ্রহ করে অর্ডার নম্বর নিয়ে আমাদের সাথে যোগাযোগ করুন।',
        }
        break
    }
  } catch (err) {
    log.error('verify_page.failed', { invoiceId, err })
    failure = {
      heading: 'যাচাই করা যাচ্ছে না',
      body:
        'পেমেন্ট গেটওয়েতে পৌঁছানো যাচ্ছে না। আপনার পেমেন্ট সম্পন্ন হয়ে থাকলে ' +
        'ইমেইলে ডাউনলোড লিংক পৌঁছে যাবে।',
    }
  }

  // redirect() throws its own control-flow signal, so it must sit outside the
  // try/catch above or it would be swallowed as an error.
  if (receiptToken) {
    redirect(`/thank-you?t=${encodeURIComponent(receiptToken)}`)
  }

  return (
    <Shell heading={failure?.heading ?? 'কিছু একটা ভুল হয়েছে'}>
      <p>{failure?.body ?? ''}</p>
    </Shell>
  )
}

function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ''
  return value?.trim() ?? ''
}

function Shell({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <main id="main" className="px-5 py-20">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl sm:text-3xl">{heading}</h1>
        <div className="mt-4 text-[--color-muted]">{children}</div>
        <Link
          href="/checkout"
          className="mt-8 inline-block rounded-xl bg-[--color-cta] px-6 py-3 font-semibold text-white hover:bg-[--color-cta-hover]"
        >
          আবার চেষ্টা করুন
        </Link>
      </div>
    </main>
  )
}
