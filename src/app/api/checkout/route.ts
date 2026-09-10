import { NextResponse } from 'next/server'

import { isConfigError } from '@/config/env'
import { formatBdt, poisha } from '@/domain/money'
import { withConfigGuard } from '@/lib/http'
import { clientIp, consumeRateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/logger'
import { CheckoutError, startCheckout } from '@/services/checkout'
import { checkoutBodySchema, limitAttribution } from '@/services/checkout-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/checkout
 *
 * The request schema lives in services/checkout-contract.ts so it can be unit
 * tested. Note what it does NOT contain: any amount, price, total or currency.
 * The client picks an offer and may propose a coupon. Everything payable is
 * computed server-side from database rows.
 */

export async function POST(request: Request): Promise<Response> {
  return withConfigGuard(() => handle(request))
}

async function handle(request: Request): Promise<Response> {
  const ip = clientIp(request.headers)

  // 12 checkout attempts per IP per 10 minutes. Generous for a human who
  // mistypes a card twice, restrictive for a script.
  const limit = await consumeRateLimit(`checkout:${ip}`, 12, 600)
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'অনুরোধটি পড়া যায়নি।' }, { status: 400 })
  }

  const parsed = checkoutBodySchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { ok: false, error: first?.message ?? 'তথ্য সঠিক নয়।', field: first?.path.join('.') },
      { status: 400 },
    )
  }

  const body = parsed.data
  const attribution = limitAttribution(body.attribution)

  try {
    const result = await startCheckout({
      offerCode: body.offerCode,
      couponCode: body.couponCode ?? null,
      name: body.name,
      email: body.email,
      phone: body.phone,
      idempotencyKey: body.idempotencyKey,
      attribution,
    })

    return NextResponse.json({
      ok: true,
      paymentUrl: result.paymentUrl,
      orderNumber: result.orderNumber,
      replayed: result.replayed,
      // Echoed so the client can show what will be charged. Display only.
      amount: {
        total: result.breakdown.total,
        display: formatBdt(poisha(result.breakdown.total)),
        discount: result.breakdown.discount,
        couponApplied: result.breakdown.appliedCouponCode,
        couponRejected: result.breakdown.couponRejection,
      },
    })
  } catch (err) {
    if (err instanceof CheckoutError) {
      const status =
        err.code === 'gateway_unavailable' || err.code === 'gateway_rejected' ? 502 : 400
      log.warn('checkout.rejected', { code: err.code, ip })
      return NextResponse.json({ ok: false, error: err.userMessageBn }, { status })
    }

    // Not ours to swallow: the guard around this handler turns a missing
    // configuration into a 503 that says which variable is absent.
    if (isConfigError(err)) throw err

    log.error('checkout.unhandled', { err, ip })
    return NextResponse.json(
      { ok: false, error: 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।' },
      { status: 500 },
    )
  }
}
