import { NextResponse } from 'next/server'

import { formatBdt, poisha } from '@/domain/money'
import { withConfigGuard } from '@/lib/http'
import { clientIp, consumeRateLimit } from '@/lib/rate-limit'
import { CheckoutError, previewPrice } from '@/services/checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REJECTION_BN: Record<string, string> = {
  unknown: 'এই কোডটি নেই।',
  inactive: 'কোডটি এখন সক্রিয় নয়।',
  expired: 'কোডটির মেয়াদ শেষ।',
  exhausted: 'কোডটির ব্যবহারের সীমা শেষ।',
  below_minimum: 'এই অর্ডারের পরিমাণ কোডটির ন্যূনতম শর্ত পূরণ করে না।',
}

/**
 * GET /api/coupon?code=…&offer=…
 *
 * Read-only preview so the checkout form can show what a code does BEFORE an
 * order exists. The same pricing engine runs again, server-side, when the
 * order is actually created; this response is never trusted for money.
 */
export async function GET(request: Request): Promise<Response> {
  return withConfigGuard(async () => {
    const ip = clientIp(request.headers)
    const limit = await consumeRateLimit(`coupon:${ip}`, 30, 600)
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: 'অনেকবার চেষ্টা হয়েছে। একটু পরে আবার চেষ্টা করুন।' }, { status: 429 })
    }

    const url = new URL(request.url)
    const code = (url.searchParams.get('code') ?? '').trim().slice(0, 64)
    const offer = (url.searchParams.get('offer') ?? '').trim().slice(0, 64)
    if (!code || !offer) return NextResponse.json({ ok: false, error: 'কোড দিন।' }, { status: 400 })

    try {
      const b = await previewPrice(offer, code)
      if (b.couponRejection) {
        return NextResponse.json({ ok: false, error: REJECTION_BN[b.couponRejection] ?? 'কোডটি প্রযোজ্য নয়।' })
      }
      return NextResponse.json({
        ok: true,
        code: b.appliedCouponCode,
        discount: formatBdt(poisha(b.discount)),
        total: formatBdt(poisha(b.total)),
      })
    } catch (err) {
      if (err instanceof CheckoutError) return NextResponse.json({ ok: false, error: err.userMessageBn }, { status: 400 })
      throw err
    }
  })
}
