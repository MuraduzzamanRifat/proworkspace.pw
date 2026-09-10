import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { getDb, type Database } from '@/db'
import {
  auditLogs,
  customers,
  downloadEvents,
  downloadGrants,
  orderItems,
  orders,
  payments,
  products,
} from '@/db/schema'
import { poisha } from '@/domain/money'
import { type OrderState } from '@/domain/order-state'
import { RefundError, decideRefund, type RefundDecision } from '@/domain/refund'
import { log } from '@/lib/logger'
import { hasAtLeast, type AdminIdentity } from '@/lib/session'
import { PRODUCT } from '@/config/product'
import { buildDownloadLinks } from '@/services/fulfilment'
import { recordAudit } from '@/services/admin-auth'
import { sendDeliveryEmail } from '@/services/email'

/**
 * Admin operations on a single order.
 *
 * A NOTE ON REFUNDS, because the limit matters more than the feature.
 *
 * `recordRefund` does NOT move money. UddoktaPay refunds are issued in the
 * gateway's own panel, and there is no verified refund API in the integration
 * this project reuses. This function records a refund that has already been
 * made there, and applies its consequences here: order status, the refunded
 * total, and revocation of download access on a full refund.
 *
 * Implementing it as "click here to refund" without a verified gateway call
 * would be a button that lies. The admin UI says "record" for the same reason.
 */

export class AdminActionError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AdminActionError'
    this.code = code
  }
}

/** Bengali wording for the pure refund rules, which throw in English. */
function refundMessageBn(code: RefundError['code']): string {
  switch (code) {
    case 'exceeds_total':
      return 'ফেরতের পরিমাণ অর্ডারের মোট পরিমাণের চেয়ে বেশি হতে পারে না।'
    case 'nothing_refundable':
      return 'এই অর্ডারের সম্পূর্ণ ফেরত ইতিমধ্যে রেকর্ড করা হয়েছে।'
    case 'bad_amount':
    default:
      return 'ফেরতের পরিমাণ সঠিক নয়।'
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface OrderDetail {
  id: string
  orderNumber: string
  status: OrderState
  email: string
  name: string
  phone: string
  subtotalPoisha: number
  discountPoisha: number
  taxPoisha: number
  totalPoisha: number
  refundedPoisha: number
  couponCode: string | null
  attribution: Record<string, string>
  notes: string
  createdAt: Date
  paidAt: Date | null
  fulfilledAt: Date | null
  refundedAt: Date | null
  items: Array<{
    productTitle: string
    productSku: string
    offerLabel: string
    quantity: number
    unitPricePoisha: number
    lineTotalPoisha: number
  }>
  payments: Array<{
    provider: string
    invoiceId: string
    transactionId: string
    method: string
    senderNumber: string
    amountPoisha: number
    feePoisha: number
    gatewayStatus: string
    verifiedAt: Date | null
  }>
  grants: Array<{
    id: string
    publicId: string
    downloadCount: number
    maxDownloads: number | null
    expiresAt: Date | null
    revokedAt: Date | null
  }>
  downloadHistory: Array<{
    succeeded: boolean
    reason: string
    ipAddress: string
    createdAt: Date
  }>
  audit: Array<{
    action: string
    actorEmail: string
    createdAt: Date
  }>
}

export async function getOrderDetail(
  orderNumber: string,
  dbParam?: Database,
): Promise<OrderDetail | null> {
  const db = dbParam ?? getDb()
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)

  const order = orderRows[0]
  if (!order) return null

  const [items, paymentRows, grants, history, audit] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
    db.select().from(downloadGrants).where(eq(downloadGrants.orderId, order.id)),
    db
      .select({
        succeeded: downloadEvents.succeeded,
        reason: downloadEvents.reason,
        ipAddress: downloadEvents.ipAddress,
        createdAt: downloadEvents.createdAt,
        grantId: downloadEvents.grantId,
      })
      .from(downloadEvents)
      .innerJoin(downloadGrants, eq(downloadEvents.grantId, downloadGrants.id))
      .where(eq(downloadGrants.orderId, order.id))
      .orderBy(desc(downloadEvents.createdAt))
      .limit(25),
    db
      .select({
        action: auditLogs.action,
        actorEmail: auditLogs.actorEmail,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'order'), eq(auditLogs.entityId, order.id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25),
  ])

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    email: order.email,
    name: order.name,
    phone: order.phone,
    subtotalPoisha: order.subtotalPoisha,
    discountPoisha: order.discountPoisha,
    taxPoisha: order.taxPoisha,
    totalPoisha: order.totalPoisha,
    refundedPoisha: order.refundedPoisha,
    couponCode: order.couponCode,
    attribution: order.attribution,
    notes: order.notes,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    fulfilledAt: order.fulfilledAt,
    refundedAt: order.refundedAt,
    items: items.map((i) => ({
      productTitle: i.productTitle,
      productSku: i.productSku,
      offerLabel: i.offerLabel,
      quantity: i.quantity,
      unitPricePoisha: i.unitPricePoisha,
      lineTotalPoisha: i.lineTotalPoisha,
    })),
    payments: paymentRows.map((p) => ({
      provider: p.provider,
      invoiceId: p.gatewayInvoiceId,
      transactionId: p.gatewayTransactionId,
      method: p.paymentMethod,
      senderNumber: p.senderNumber,
      amountPoisha: p.amountPoisha,
      feePoisha: p.feePoisha,
      gatewayStatus: p.gatewayStatus,
      verifiedAt: p.verifiedAt,
    })),
    grants: grants.map((g) => ({
      id: g.id,
      publicId: g.publicId,
      downloadCount: g.downloadCount,
      maxDownloads: g.maxDownloads,
      expiresAt: g.expiresAt,
      revokedAt: g.revokedAt,
    })),
    downloadHistory: history.map((h) => ({
      succeeded: h.succeeded,
      reason: h.reason,
      ipAddress: h.ipAddress,
      createdAt: h.createdAt,
    })),
    audit,
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Record a refund that was issued in the gateway panel.
 *
 * Runs inside a transaction with the order row locked, so two admins clicking
 * at once cannot each record a full refund and drive `refunded_poisha` past
 * the order total.
 */
export async function recordRefund(
  args: {
    orderNumber: string
    amountPoisha: number
    reason: string
    actor: AdminIdentity
  },
  dbParam?: Database,
): Promise<{ status: OrderState; refundedPoisha: number }> {
  const db = dbParam ?? getDb()
  if (!hasAtLeast(args.actor.role, 'admin')) {
    throw new AdminActionError('forbidden', 'ফেরত রেকর্ড করার অনুমতি নেই।')
  }
  if (!Number.isInteger(args.amountPoisha) || args.amountPoisha <= 0) {
    throw new AdminActionError('bad_amount', 'ফেরতের পরিমাণ সঠিক নয়।')
  }

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, args.orderNumber))
      .limit(1)
      .for('update')

    const order = rows[0]
    if (!order) throw new AdminActionError('not_found', 'অর্ডারটি পাওয়া যায়নি।')

    // All the arithmetic and legality rules live in one pure, tested place.
    // Reimplementing them here would give two versions to keep in agreement.
    let decision: RefundDecision
    try {
      decision = decideRefund({
        currentStatus: order.status,
        orderTotal: poisha(order.totalPoisha),
        alreadyRefunded: poisha(order.refundedPoisha),
        amount: poisha(args.amountPoisha),
      })
    } catch (err) {
      if (err instanceof RefundError) {
        throw new AdminActionError(err.code, refundMessageBn(err.code))
      }
      throw err
    }

    const newRefunded = decision.newRefundedTotal
    const nextStatus = decision.nextStatus
    const now = new Date()

    await tx
      .update(orders)
      .set({
        refundedPoisha: newRefunded,
        status: nextStatus,
        refundedAt: now,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id))

    // A full refund revokes access. A partial one does not: the buyer keeps a
    // file they have already downloaded, and pretending otherwise would be
    // theatre.
    if (nextStatus === 'refunded') {
      await tx
        .update(downloadGrants)
        .set({ revokedAt: now })
        .where(and(eq(downloadGrants.orderId, order.id), isNull(downloadGrants.revokedAt)))
    }

    if (order.customerId) {
      await tx
        .update(customers)
        .set({
          totalSpentPoisha: sql`greatest(0, ${customers.totalSpentPoisha} - ${args.amountPoisha})`,
          updatedAt: now,
        })
        .where(eq(customers.id, order.customerId))
    }

    return { orderId: order.id, status: nextStatus, refundedPoisha: newRefunded, previous: order.status }
  })

  await recordAudit({
    actorId: args.actor.userId,
    actorEmail: args.actor.email,
    action: 'order.refund_recorded',
    entityType: 'order',
    entityId: result.orderId,
    before: { status: result.previous },
    after: {
      status: result.status,
      refundedPoisha: result.refundedPoisha,
      amount: args.amountPoisha,
      reason: args.reason.slice(0, 500),
    },
  })

  log.info('admin.refund_recorded', {
    orderNumber: args.orderNumber,
    amount: args.amountPoisha,
    status: result.status,
  })

  return { status: result.status, refundedPoisha: result.refundedPoisha }
}

/** Re-send the delivery email to the address on the order. */
export async function resendDelivery(
  args: { orderNumber: string; actor: AdminIdentity },
  dbParam?: Database,
): Promise<{ sent: boolean; reason?: string }> {
  const db = dbParam ?? getDb()
  if (!hasAtLeast(args.actor.role, 'support')) {
    throw new AdminActionError('forbidden', 'অনুমতি নেই।')
  }

  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      email: orders.email,
      name: orders.name,
      total: orders.totalPoisha,
      status: orders.status,
      grantPublicId: downloadGrants.publicId,
      revokedAt: downloadGrants.revokedAt,
    })
    .from(orders)
    .leftJoin(downloadGrants, eq(downloadGrants.orderId, orders.id))
    .where(eq(orders.orderNumber, args.orderNumber))
    .orderBy(desc(downloadGrants.createdAt))
    .limit(1)

  const order = rows[0]
  if (!order) throw new AdminActionError('not_found', 'অর্ডারটি পাওয়া যায়নি।')
  if (!order.grantPublicId || order.revokedAt) {
    throw new AdminActionError('no_grant', 'এই অর্ডারের সক্রিয় ডাউনলোড অনুমতি নেই।')
  }

  const productRows = await db.select({ title: products.title }).from(products).limit(1)
  const product = productRows[0]

  const result = await sendDeliveryEmail({
    to: order.email,
    customerName: order.name,
    orderNumber: order.orderNumber,
    productTitle: product?.title ?? PRODUCT.title,
    totalPoisha: order.total,
    downloads: buildDownloadLinks(order.grantPublicId),
  })

  await recordAudit({
    actorId: args.actor.userId,
    actorEmail: args.actor.email,
    action: result.sent ? 'order.delivery_resent' : 'order.delivery_resend_failed',
    entityType: 'order',
    entityId: order.orderId,
    after: { sent: result.sent, reason: result.reason ?? '' },
  })

  return result
}

/** Manually revoke or restore download access. */
export async function setGrantRevoked(
  args: { orderNumber: string; revoked: boolean; actor: AdminIdentity },
  dbParam?: Database,
): Promise<void> {
  const db = dbParam ?? getDb()
  if (!hasAtLeast(args.actor.role, 'admin')) {
    throw new AdminActionError('forbidden', 'অনুমতি নেই।')
  }

  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.orderNumber, args.orderNumber))
    .limit(1)

  const order = rows[0]
  if (!order) throw new AdminActionError('not_found', 'অর্ডারটি পাওয়া যায়নি।')

  await db
    .update(downloadGrants)
    .set({ revokedAt: args.revoked ? new Date() : null })
    .where(eq(downloadGrants.orderId, order.id))

  await recordAudit({
    actorId: args.actor.userId,
    actorEmail: args.actor.email,
    action: args.revoked ? 'order.download_revoked' : 'order.download_restored',
    entityType: 'order',
    entityId: order.id,
  })
}
