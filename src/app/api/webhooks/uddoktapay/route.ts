import { NextResponse } from 'next/server'

import { serverEnv } from '@/config/env'
import { safeEqual } from '@/lib/crypto'
import { withConfigGuard } from '@/lib/http'
import { log } from '@/lib/logger'
import { parseGatewayPayload, verifyPayment } from '@/payments/uddoktapay'
import { settlePayment } from '@/services/fulfilment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/uddoktapay
 *
 * Two layers of trust, in this order:
 *
 *   1. The RT-UDDOKTAPAY-API-KEY header must equal our own key, compared in
 *      constant time. This is what the gateway sends and it is a cheap
 *      rejection for random internet noise.
 *
 *   2. We then ask the gateway directly what happened, using only the invoice
 *      id from the body. The body itself is NEVER trusted for the amount or
 *      the status. If the shared key ever leaks, a forged webhook still cannot
 *      manufacture a paid order, because step 2 would contradict it.
 *
 * The endpoint always answers 200 for anything it successfully authenticated,
 * including duplicates and mismatches. A gateway that receives a 500 retries,
 * and retrying is pointless once the event is recorded.
 */
export async function POST(request: Request): Promise<Response> {
  return withConfigGuard(() => handle(request))
}

async function handle(request: Request): Promise<Response> {
  const env = serverEnv()
  const expectedKey = env.UDDOKTAPAY_API_KEY

  if (!expectedKey) {
    log.error('webhook.not_configured', {})
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const presented = request.headers.get('rt-uddoktapay-api-key') ?? ''
  if (!safeEqual(presented, expectedKey)) {
    log.warn('webhook.bad_key', {})
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only the invoice id is taken from the body.
  let invoiceId = ''
  try {
    invoiceId = parseGatewayPayload(raw).invoiceId
  } catch {
    log.warn('webhook.unparseable_payload', {})
    return NextResponse.json({ error: 'Unrecognised payload' }, { status: 400 })
  }

  if (!invoiceId) {
    log.warn('webhook.missing_invoice_id', {})
    return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 })
  }

  try {
    // Authoritative. The webhook body is a notification, not evidence.
    const verified = await verifyPayment(invoiceId)
    const result = await settlePayment(verified, 'webhook')

    log.info('webhook.handled', { invoiceId, outcome: result.outcome })
    return NextResponse.json({ received: true, outcome: result.outcome })
  } catch (err) {
    // A verification failure is worth a retry, so this one does return 500.
    log.error('webhook.verify_failed', { invoiceId, err })
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
