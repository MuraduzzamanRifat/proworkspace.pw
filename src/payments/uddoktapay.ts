import { z } from 'zod'

import { serverEnv } from '@/config/env'
import { fromGatewayAmount, toGatewayAmount, type Poisha } from '@/domain/money'

/**
 * UddoktaPay / Paymently gateway client.
 *
 * The contract implemented here is not guessed. It is the one already running
 * in production in ../upwork-profile-optimizer/backend:
 *
 *   POST {base}/api/checkout-v2   header RT-UDDOKTAPAY-API-KEY
 *        -> { payment_url }       invoice id = last path segment of payment_url
 *   POST {base}/api/verify-payment  body { invoice_id }
 *        -> { status: "COMPLETED" | ... , transaction_id, amount, fee,
 *             charged_amount, payment_method, sender_number, metadata, ... }
 *        -> or { status: false, message } on error
 *   Webhook: same field set, authenticated by the RT-UDDOKTAPAY-API-KEY header
 *            matching our own key. Only status === "COMPLETED" means money.
 *
 * Card data never touches this application. The gateway hosts the payment page
 * and returns only a result, which is why there is no PCI surface here.
 */

const REQUEST_TIMEOUT_MS = 15_000

export class GatewayError extends Error {
  readonly code:
    | 'not_configured'
    | 'network'
    | 'timeout'
    | 'bad_response'
    | 'rejected'
  readonly detail: string

  constructor(code: GatewayError['code'], message: string, detail = '') {
    super(message)
    this.name = 'GatewayError'
    this.code = code
    this.detail = detail
  }
}

/** Terminal states reported by the gateway. */
export type GatewayStatus = 'COMPLETED' | 'PENDING' | 'ERROR' | 'CANCELLED' | 'UNKNOWN'

export interface CreateChargeInput {
  fullName: string
  email: string
  amount: Poisha
  /** Echoed back on verify and webhook. Carries our order id. */
  metadata: Record<string, string>
  redirectUrl: string
  cancelUrl: string
  webhookUrl: string
}

export interface CreateChargeResult {
  paymentUrl: string
  invoiceId: string
}

export interface VerifyResult {
  status: GatewayStatus
  rawStatus: string
  invoiceId: string
  transactionId: string
  /** What the gateway says the customer paid. Authoritative for reconciliation. */
  amount: Poisha
  fee: Poisha
  chargedAmount: Poisha
  paymentMethod: string
  senderNumber: string
  email: string
  fullName: string
  metadata: Record<string, string>
  raw: Record<string, unknown>
}

/** The gateway is loose about types, so accept string-or-number everywhere. */
const looseAmount = z.union([z.string(), z.number()]).optional()

const verifySchema = z.object({
  status: z.union([z.string(), z.boolean()]).optional(),
  message: z.string().optional(),
  full_name: z.string().optional(),
  email: z.string().optional(),
  amount: looseAmount,
  fee: looseAmount,
  charged_amount: looseAmount,
  invoice_id: z.string().optional(),
  payment_method: z.string().optional(),
  sender_number: z.string().optional(),
  transaction_id: z.string().optional(),
  date: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number()])).optional(),
})

function toPoisha(value: string | number | undefined): Poisha {
  if (value === undefined || value === null || value === '') return fromGatewayAmount('0')
  const asString = typeof value === 'number' ? value.toFixed(2) : String(value)
  try {
    return fromGatewayAmount(asString)
  } catch {
    // A gateway amount we cannot parse must not be silently treated as zero in
    // a reconciliation, but it also must not crash a webhook. Callers compare
    // against the expected total and will flag the mismatch.
    return fromGatewayAmount('0')
  }
}

function normaliseStatus(raw: unknown): GatewayStatus {
  if (raw === false) return 'ERROR'
  if (typeof raw !== 'string') return 'UNKNOWN'
  const upper = raw.toUpperCase()
  if (upper === 'COMPLETED') return 'COMPLETED'
  if (upper === 'PENDING') return 'PENDING'
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED'
  if (upper === 'ERROR' || upper === 'FALSE') return 'ERROR'
  return 'UNKNOWN'
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const env = serverEnv()
  const apiKey = env.UDDOKTAPAY_API_KEY
  if (!apiKey) {
    throw new GatewayError('not_configured', 'UDDOKTAPAY_API_KEY is not set')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${env.UDDOKTAPAY_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'RT-UDDOKTAPAY-API-KEY': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GatewayError('timeout', `Gateway did not respond within ${REQUEST_TIMEOUT_MS} ms`)
    }
    throw new GatewayError('network', 'Could not reach the payment gateway')
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GatewayError(
      'bad_response',
      'Gateway returned a non-JSON response',
      // Truncated, and this never contains card data.
      text.slice(0, 200),
    )
  }

  if (!response.ok) {
    throw new GatewayError('rejected', `Gateway returned HTTP ${response.status}`, text.slice(0, 200))
  }

  return parsed
}

/**
 * Create a hosted checkout session.
 *
 * Returns the URL to send the customer to, plus the invoice id used later to
 * verify and to deduplicate.
 */
export async function createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
  const payload = {
    full_name: input.fullName.trim() || 'Customer',
    email: input.email.trim().toLowerCase(),
    amount: toGatewayAmount(input.amount),
    metadata: input.metadata,
    redirect_url: input.redirectUrl,
    cancel_url: input.cancelUrl,
    webhook_url: input.webhookUrl,
    return_type: 'GET' as const,
  }

  const parsed = await postJson('/api/checkout-v2', payload)
  const shape = z
    .object({
      status: z.union([z.string(), z.boolean()]).optional(),
      message: z.string().optional(),
      payment_url: z.string().optional(),
      invoice_id: z.string().optional(),
    })
    .safeParse(parsed)

  if (!shape.success) {
    throw new GatewayError('bad_response', 'Gateway response did not match the expected shape')
  }

  const paymentUrl = shape.data.payment_url
  if (!paymentUrl) {
    throw new GatewayError(
      'rejected',
      shape.data.message || 'Gateway did not return a payment URL',
    )
  }

  // Prefer an explicit id; fall back to the last path segment, which is what
  // the existing production integration relies on.
  const fromPath = paymentUrl.split('?')[0]!.split('/').filter(Boolean).pop() ?? ''
  const invoiceId = shape.data.invoice_id?.trim() || fromPath

  if (!invoiceId) {
    throw new GatewayError('bad_response', 'Could not determine the invoice id')
  }

  return { paymentUrl, invoiceId }
}

/**
 * Ask the gateway what actually happened.
 *
 * This is the ONLY thing allowed to move an order to `paid`. A browser
 * arriving at the success URL proves the customer navigated, not that money
 * moved.
 */
export async function verifyPayment(invoiceId: string): Promise<VerifyResult> {
  if (!invoiceId.trim()) {
    throw new GatewayError('rejected', 'Missing invoice id')
  }

  const parsed = await postJson('/api/verify-payment', { invoice_id: invoiceId })
  return parseGatewayPayload(parsed, invoiceId)
}

/**
 * Shared by verify and the webhook handler: both receive the same field set.
 * Exported so the webhook can normalise its body without a second HTTP call.
 */
export function parseGatewayPayload(input: unknown, fallbackInvoiceId = ''): VerifyResult {
  const shape = verifySchema.safeParse(input)
  if (!shape.success) {
    throw new GatewayError('bad_response', 'Gateway payload did not match the expected shape')
  }
  const d = shape.data

  const metadata: Record<string, string> = {}
  for (const [k, v] of Object.entries(d.metadata ?? {})) {
    metadata[k] = String(v)
  }

  return {
    status: normaliseStatus(d.status),
    rawStatus: typeof d.status === 'string' ? d.status : String(d.status ?? ''),
    invoiceId: d.invoice_id?.trim() || fallbackInvoiceId,
    transactionId: d.transaction_id?.trim() ?? '',
    amount: toPoisha(d.amount),
    fee: toPoisha(d.fee),
    chargedAmount: toPoisha(d.charged_amount),
    paymentMethod: d.payment_method?.trim() ?? '',
    senderNumber: d.sender_number?.trim() ?? '',
    email: (d.email ?? '').trim().toLowerCase(),
    fullName: (d.full_name ?? '').trim(),
    metadata,
    raw: (input ?? {}) as Record<string, unknown>,
  }
}
