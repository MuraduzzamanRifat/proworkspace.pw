import { and, eq, inArray, sql } from 'drizzle-orm'

import { clientEnv, serverEnv } from '@/config/env'
import { getDb, type Database } from '@/db'
import {
  checkoutSessions,
  customers,
  downloadGrants,
  orders,
  payments,
  products,
  trackingEvents,
  webhookEvents,
} from '@/db/schema'
import { randomId, signToken } from '@/lib/crypto'
import { log } from '@/lib/logger'
import type { VerifyResult } from '@/payments/uddoktapay'
import {
  sendAdminOrderAlert,
  sendDeliveryEmail,
  sendPaymentMismatchAlert,
} from '@/services/email'

/**
 * Settlement and fulfilment.
 *
 * Two independent things can tell us a payment succeeded: the gateway's
 * webhook, and the customer's browser landing on the return URL (which then
 * calls verify server-side). Both funnel into `settlePayment`, and it must be
 * safe to run any number of times, in any order, concurrently.
 *
 * The idempotency barrier is NOT an application-level "have we seen this?"
 * check, which races. It is a conditional UPDATE:
 *
 *   UPDATE orders SET status='paid' WHERE id=? AND status IN (unpaid states)
 *
 * Exactly one caller gets a row back. Everyone else gets zero rows and stops.
 */

const DOWNLOAD_TTL_DAYS = 365

export type SettlementOutcome =
  | 'fulfilled'
  | 'already_processed'
  | 'not_completed'
  | 'unknown_invoice'
  | 'amount_mismatch'

export interface SettlementResult {
  outcome: SettlementOutcome
  orderId?: string
  orderNumber?: string
  downloadUrl?: string
  emailSent?: boolean
  detail?: string
}

/** States from which a payment may legitimately settle. */
const SETTLEABLE = ['pending', 'payment_pending', 'payment_failed'] as const

export async function settlePayment(
  verified: VerifyResult,
  source: 'webhook' | 'verify',
  dbParam?: Database,
): Promise<SettlementResult> {
  const db = dbParam ?? getDb()
  const invoiceId = verified.invoiceId

  // --- Audit trail. Deduplication is handled below by the conditional UPDATE,
  // so a conflict here is recorded, not fatal.
  const eventKey = `uddoktapay:${invoiceId}:${verified.status}`
  await db
    .insert(webhookEvents)
    .values({
      provider: 'uddoktapay',
      eventKey,
      payload: verified.raw,
    })
    .onConflictDoNothing({ target: webhookEvents.eventKey })

  if (verified.status !== 'COMPLETED') {
    log.info('settle.not_completed', { invoiceId, status: verified.status, source })
    await markFailedIfPending(db, invoiceId, verified.status)
    return { outcome: 'not_completed', detail: verified.rawStatus }
  }

  // --- Find the order this invoice belongs to ------------------------------
  const found = await db
    .select({
      paymentId: payments.id,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalPoisha: orders.totalPoisha,
      email: orders.email,
      name: orders.name,
      customerId: orders.customerId,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(eq(payments.gatewayInvoiceId, invoiceId))
    .limit(1)

  const row = found[0]
  if (!row) {
    // Money moved for an invoice we have no record of. This is never normal.
    log.error('settle.unknown_invoice', { invoiceId, source })
    return { outcome: 'unknown_invoice' }
  }

  if (row.status === 'paid' || row.status === 'fulfilled') {
    log.info('settle.already_processed', { orderId: row.orderId, source })
    return {
      outcome: 'already_processed',
      orderId: row.orderId,
      orderNumber: row.orderNumber,
    }
  }

  // --- Reconcile the amount BEFORE granting anything -----------------------
  // The gateway is authoritative for what was collected. If it collected less
  // than we asked for, that is either a gateway bug or tampering, and either
  // way a human decides, not this function.
  if (verified.amount < row.totalPoisha) {
    log.error('settle.amount_mismatch', {
      orderId: row.orderId,
      expected: row.totalPoisha,
      received: verified.amount,
      invoiceId,
    })
    await db
      .update(payments)
      .set({
        gatewayStatus: verified.rawStatus,
        amountPoisha: verified.amount,
        feePoisha: verified.fee,
        chargedAmountPoisha: verified.chargedAmount,
        rawPayload: verified.raw,
        verifiedAt: new Date(),
      })
      .where(eq(payments.id, row.paymentId))

    void sendPaymentMismatchAlert({
      orderNumber: row.orderNumber,
      expectedPoisha: row.totalPoisha,
      receivedPoisha: verified.amount,
      invoiceId,
    })

    return {
      outcome: 'amount_mismatch',
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      detail: `expected ${row.totalPoisha}, received ${verified.amount}`,
    }
  }

  // --- Claim the settlement ------------------------------------------------
  const grantPublicId = randomId(18)
  const now = new Date()

  const claimed = await db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({ status: 'paid', paidAt: now, updatedAt: now })
      .where(and(eq(orders.id, row.orderId), inArray(orders.status, [...SETTLEABLE])))
      .returning({ id: orders.id })

    // Someone else settled it between our read and this write.
    if (updated.length === 0) return false

    await tx
      .update(payments)
      .set({
        gatewayStatus: verified.rawStatus,
        gatewayTransactionId: verified.transactionId,
        paymentMethod: verified.paymentMethod,
        senderNumber: verified.senderNumber,
        amountPoisha: verified.amount,
        feePoisha: verified.fee,
        chargedAmountPoisha: verified.chargedAmount,
        rawPayload: verified.raw,
        verifiedAt: now,
      })
      .where(eq(payments.id, row.paymentId))

    if (row.customerId) {
      await tx
        .update(customers)
        .set({
          orderCount: sql`${customers.orderCount} + 1`,
          totalSpentPoisha: sql`${customers.totalSpentPoisha} + ${row.totalPoisha}`,
          updatedAt: now,
        })
        .where(eq(customers.id, row.customerId))
    }

    await tx.insert(downloadGrants).values({
      orderId: row.orderId,
      publicId: grantPublicId,
      email: row.email,
      maxDownloads: null,
      expiresAt: new Date(now.getTime() + DOWNLOAD_TTL_DAYS * 86_400_000),
    })

    await tx
      .update(checkoutSessions)
      .set({ completed: true, updatedAt: now })
      .where(eq(checkoutSessions.orderId, row.orderId))

    // Queue the server-side Purchase event. Dispatch happens out of band so a
    // slow Meta endpoint cannot delay this response.
    await tx
      .insert(trackingEvents)
      .values({
        eventId: `purchase-${row.orderId}`,
        eventName: 'Purchase',
        orderId: row.orderId,
        payload: {
          value: row.totalPoisha / 100,
          currency: 'BDT',
          orderNumber: row.orderNumber,
          email: row.email,
        },
        status: 'pending',
      })
      .onConflictDoNothing({ target: trackingEvents.eventId })

    return true
  })

  if (!claimed) {
    log.info('settle.lost_race', { orderId: row.orderId, source })
    return {
      outcome: 'already_processed',
      orderId: row.orderId,
      orderNumber: row.orderNumber,
    }
  }

  // --- Deliver. Everything past this point is best-effort. -----------------
  // The customer has paid and the grant exists. If email fails, the thank-you
  // page still shows the download link, and the admin can resend.
  const downloadUrl = buildDownloadUrl(grantPublicId)

  let emailSent = false
  try {
    const productRows = await db
      .select({ title: products.title, deliverables: products.deliverables })
      .from(products)
      .limit(1)
    const product = productRows[0]

    const result = await sendDeliveryEmail({
      to: row.email,
      customerName: row.name,
      orderNumber: row.orderNumber,
      productTitle: product?.title ?? 'আপনার বই',
      totalPoisha: row.totalPoisha,
      downloadUrl,
      deliverables: product?.deliverables ?? [],
    })
    emailSent = result.sent

    void sendAdminOrderAlert({
      orderNumber: row.orderNumber,
      email: row.email,
      totalPoisha: row.totalPoisha,
      paymentMethod: verified.paymentMethod,
    })
  } catch (err) {
    log.error('settle.delivery_email_failed', { orderId: row.orderId, err })
  }

  await db
    .update(orders)
    .set({ status: 'fulfilled', fulfilledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orders.id, row.orderId), eq(orders.status, 'paid')))

  log.info('settle.fulfilled', {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    source,
    emailSent,
  })

  return {
    outcome: 'fulfilled',
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    downloadUrl,
    emailSent,
  }
}

/**
 * Token kinds.
 *
 * Both the download link and the thank-you receipt link are HMACs over a
 * `sub`. Without a `kind` claim a receipt token would be a valid download
 * token, because the verifier cannot tell what a subject was meant to
 * authorise. Every consumer checks this.
 */
export const TOKEN_KIND_DOWNLOAD = 'dl'
export const TOKEN_KIND_RECEIPT = 'rcpt'

/** A signed, expiring URL. The grant id alone is never enough to download. */
export function buildDownloadUrl(grantPublicId: string): string {
  const secret = serverEnv().DOWNLOAD_SECRET
  const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_DAYS * 86_400
  const token = signToken({ sub: grantPublicId, exp, kind: TOKEN_KIND_DOWNLOAD }, secret)
  return `${clientEnv.NEXT_PUBLIC_SITE_URL}/api/download/${token}`
}

/**
 * Short-lived link to the thank-you page.
 *
 * Two hours, because its only job is to carry a just-paid customer from the
 * gateway to their download. The order number is not used as the key: it is
 * printed on receipts and quoted in support chats, and neither of those should
 * hand over the product.
 */
export function buildReceiptToken(orderId: string): string {
  const secret = serverEnv().DOWNLOAD_SECRET
  const exp = Math.floor(Date.now() / 1000) + 2 * 3600
  return signToken({ sub: orderId, exp, kind: TOKEN_KIND_RECEIPT }, secret)
}

/** Record a declined attempt without disturbing an already-settled order. */
async function markFailedIfPending(
  db: Database,
  invoiceId: string,
  status: string,
): Promise<void> {
  const found = await db
    .select({ orderId: payments.orderId })
    .from(payments)
    .where(eq(payments.gatewayInvoiceId, invoiceId))
    .limit(1)

  const row = found[0]
  if (!row) return

  const nextStatus = status === 'CANCELLED' ? 'cancelled' : 'payment_failed'
  await db
    .update(orders)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(and(eq(orders.id, row.orderId), eq(orders.status, 'payment_pending')))
}
