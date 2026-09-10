import { and, eq } from 'drizzle-orm'

import { clientEnv } from '@/config/env'
import { getDb, type Database } from '@/db'
import {
  checkoutSessions,
  coupons,
  customers,
  offers,
  orderItems,
  orders,
  payments,
  products,
} from '@/db/schema'
import { poisha, type Poisha } from '@/domain/money'
import {
  calculatePrice,
  toOrderItemSnapshot,
  type PriceBreakdown,
  type PricingCoupon,
  type PricingOffer,
} from '@/domain/pricing'
import { transition } from '@/domain/order-state'
import { generateOrderNumber } from '@/lib/crypto'
import { isUniqueViolation } from '@/lib/db-errors'
import { log } from '@/lib/logger'
import { createCharge, GatewayError } from '@/payments/uddoktapay'

/**
 * Checkout.
 *
 * Ordering of side effects is deliberate and is the whole reason this is a
 * service rather than inline route code:
 *
 *   1. Price the order from database rows. The request body contributes an
 *      offer code and a coupon code, never an amount.
 *   2. Persist the order as `pending` inside one transaction, together with its
 *      immutable item snapshot. If this fails, nothing external has happened.
 *   3. Only then call the gateway. If the gateway fails, we are left with an
 *      abandoned `pending` order, which is recoverable and costs nobody money.
 *   4. Record the invoice and move to `payment_pending`.
 *
 * The reverse order — charge first, save second — is how you end up with money
 * taken against an order that does not exist.
 */

export class CheckoutError extends Error {
  readonly code:
    | 'offer_not_found'
    | 'offer_inactive'
    | 'product_inactive'
    | 'invalid_input'
    | 'gateway_unavailable'
    | 'gateway_rejected'
  readonly userMessageBn: string

  constructor(code: CheckoutError['code'], userMessageBn: string, message?: string) {
    super(message ?? code)
    this.name = 'CheckoutError'
    this.code = code
    this.userMessageBn = userMessageBn
  }
}

export interface StartCheckoutInput {
  offerCode: string
  couponCode?: string | null
  name: string
  email: string
  phone?: string
  /**
   * Client-generated, stable for the lifetime of one checkout attempt.
   * A double-click, a refresh, or a retried fetch reuses it and therefore
   * reuses the order.
   */
  idempotencyKey: string
  attribution?: Record<string, string>
}

export interface StartCheckoutResult {
  orderId: string
  orderNumber: string
  paymentUrl: string
  invoiceId: string
  breakdown: PriceBreakdown
  /** True when this was a replay of an earlier identical request. */
  replayed: boolean
}

// ---------------------------------------------------------------------------
// Catalogue lookups
// ---------------------------------------------------------------------------

async function loadOffer(
  db: Database,
  offerCode: string,
): Promise<{ pricing: PricingOffer; productSku: string; productTitle: string }> {
  const rows = await db
    .select({
      offerCode: offers.code,
      offerLabel: offers.label,
      listPrice: offers.listPricePoisha,
      price: offers.pricePoisha,
      offerActive: offers.isActive,
      productSku: products.sku,
      productTitle: products.title,
      productActive: products.isActive,
    })
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.id))
    .where(eq(offers.code, offerCode))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new CheckoutError('offer_not_found', 'এই অফারটি পাওয়া যায়নি।')
  }
  if (!row.productActive) {
    throw new CheckoutError('product_inactive', 'পণ্যটি এখন বিক্রির জন্য নেই।')
  }

  return {
    pricing: {
      code: row.offerCode,
      label: row.offerLabel,
      listPrice: poisha(row.listPrice),
      price: poisha(row.price),
      active: row.offerActive,
    },
    productSku: row.productSku,
    productTitle: row.productTitle,
  }
}

async function loadCoupon(db: Database, code: string | null): Promise<PricingCoupon | null> {
  const normalised = (code ?? '').trim().toUpperCase()
  if (normalised === '') return null

  const rows = await db.select().from(coupons).where(eq(coupons.code, normalised)).limit(1)
  const row = rows[0]
  if (!row) return null

  return {
    code: row.code,
    kind: row.kind,
    value: row.value,
    minOrder: poisha(row.minOrderPoisha),
    expiresAt: row.expiresAt,
    maxRedemptions: row.maxRedemptions,
    timesRedeemed: row.timesRedeemed,
    active: row.isActive,
  }
}

// ---------------------------------------------------------------------------
// Price preview (no writes) — used to show a coupon's effect before paying
// ---------------------------------------------------------------------------

export async function previewPrice(
  offerCode: string,
  couponCode: string | null,
  dbParam?: Database,
): Promise<PriceBreakdown> {
  const db = dbParam ?? getDb()
  const { pricing } = await loadOffer(db, offerCode)
  const coupon = await loadCoupon(db, couponCode)
  return calculatePrice({ offer: pricing, coupon, attemptedCouponCode: couponCode, now: new Date() })
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function startCheckout(
  input: StartCheckoutInput,
  dbParam?: Database,
): Promise<StartCheckoutResult> {
  // Resolved in the body, not as a default parameter, so a ConfigError from
  // an unconfigured deployment reaches the route's guard as a 503 rather
  // than escaping as an unhandled crash.
  const db = dbParam ?? getDb()
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const phone = (input.phone ?? '').trim()
  const attribution = input.attribution ?? {}

  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new CheckoutError('invalid_input', 'অনুরোধটি সঠিক নয়।', 'idempotencyKey too short')
  }

  // --- 0. Idempotent replay -------------------------------------------------
  const replay = await findByIdempotencyKey(db, input.idempotencyKey)
  if (replay) {
    log.info('checkout.replayed', { orderId: replay.orderId, email })
    return { ...replay, replayed: true }
  }

  // --- 1. Price it, server side --------------------------------------------
  const { pricing, productSku, productTitle } = await loadOffer(db, input.offerCode)
  const coupon = await loadCoupon(db, input.couponCode ?? null)

  const breakdown = calculatePrice({
    offer: pricing,
    coupon,
    attemptedCouponCode: input.couponCode ?? null,
    now: new Date(),
  })

  const snapshot = toOrderItemSnapshot(breakdown, { sku: productSku, title: productTitle })

  // --- 2. Persist the order, atomically ------------------------------------
  const customerId = await upsertCustomer(db, { email, name, phone })

  const created = await insertOrderWithRetry(db, {
    customerId,
    email,
    name,
    phone,
    breakdown,
    snapshot,
    idempotencyKey: input.idempotencyKey,
    attribution,
  })

  // Two requests raced on the same key; the loser reads the winner's order.
  if (created.raced) {
    const existing = await findByIdempotencyKey(db, input.idempotencyKey)
    if (existing) {
      log.info('checkout.raced', { orderId: existing.orderId })
      return { ...existing, replayed: true }
    }
    throw new CheckoutError('invalid_input', 'অনুরোধটি প্রক্রিয়া করা যায়নি।', 'lost idempotency race with no winner')
  }

  const { orderId, orderNumber } = created

  // --- 3. Create the hosted charge -----------------------------------------
  const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL
  let charge: { paymentUrl: string; invoiceId: string }
  try {
    charge = await createCharge({
      fullName: name || 'Customer',
      email,
      amount: breakdown.total as Poisha,
      metadata: { order_id: orderId, order_number: orderNumber, offer: breakdown.offerCode },
      redirectUrl: `${siteUrl}/payment/verify?order=${encodeURIComponent(orderNumber)}`,
      cancelUrl: `${siteUrl}/checkout?cancelled=1&order=${encodeURIComponent(orderNumber)}`,
      webhookUrl: `${siteUrl}/api/webhooks/uddoktapay`,
    })
  } catch (err) {
    log.error('checkout.gateway_failed', {
      orderId,
      code: err instanceof GatewayError ? err.code : 'unknown',
      err,
    })
    // The order stays `pending`. Nobody has been charged.
    if (err instanceof GatewayError && err.code === 'not_configured') {
      throw new CheckoutError('gateway_unavailable', 'পেমেন্ট এখন চালু নেই। একটু পরে চেষ্টা করুন।')
    }
    throw new CheckoutError('gateway_unavailable', 'পেমেন্ট সার্ভিসে পৌঁছানো যাচ্ছে না। আবার চেষ্টা করুন।')
  }

  // --- 4. Record the invoice and hand off ----------------------------------
  await db.transaction(async (tx) => {
    await tx.insert(payments).values({
      orderId,
      provider: 'uddoktapay',
      gatewayInvoiceId: charge.invoiceId,
      gatewayPaymentUrl: charge.paymentUrl,
      amountPoisha: breakdown.total,
      currency: breakdown.currency,
      gatewayStatus: 'CREATED',
    })

    await tx
      .update(orders)
      .set({ status: transition('pending', 'payment_pending'), updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
  })

  log.info('checkout.started', {
    orderId,
    orderNumber,
    email,
    total: breakdown.total,
    invoiceId: charge.invoiceId,
  })

  return {
    orderId,
    orderNumber,
    paymentUrl: charge.paymentUrl,
    invoiceId: charge.invoiceId,
    breakdown,
    replayed: false,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findByIdempotencyKey(
  db: Database,
  key: string,
): Promise<Omit<StartCheckoutResult, 'replayed'> | null> {
  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      subtotal: orders.subtotalPoisha,
      discount: orders.discountPoisha,
      shipping: orders.shippingPoisha,
      tax: orders.taxPoisha,
      total: orders.totalPoisha,
      couponCode: orders.couponCode,
      paymentUrl: payments.gatewayPaymentUrl,
      invoiceId: payments.gatewayInvoiceId,
      offerCode: orderItems.offerCode,
      offerLabel: orderItems.offerLabel,
      unitListPrice: orderItems.unitListPricePoisha,
      unitPrice: orderItems.unitPricePoisha,
      quantity: orderItems.quantity,
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orders.idempotencyKey, key))
    .limit(1)

  const row = rows[0]
  if (!row || !row.paymentUrl || !row.invoiceId) return null

  return {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    paymentUrl: row.paymentUrl,
    invoiceId: row.invoiceId,
    breakdown: {
      offerCode: row.offerCode ?? '',
      offerLabel: row.offerLabel ?? '',
      quantity: row.quantity ?? 1,
      unitListPrice: poisha(row.unitListPrice ?? row.total),
      unitPrice: poisha(row.unitPrice ?? row.total),
      subtotal: poisha(row.subtotal),
      discount: poisha(row.discount),
      appliedCouponCode: row.couponCode,
      couponRejection: null,
      shipping: poisha(row.shipping),
      tax: poisha(row.tax),
      total: poisha(row.total),
      currency: 'BDT',
    },
  }
}

async function upsertCustomer(
  db: Database,
  args: { email: string; name: string; phone: string },
): Promise<string> {
  const rows = await db
    .insert(customers)
    .values({ email: args.email, name: args.name, phone: args.phone })
    .onConflictDoUpdate({
      target: customers.email,
      set: {
        // Only overwrite with a non-empty value; a later blank must not erase
        // a name we already have.
        name: args.name === '' ? customers.name : args.name,
        phone: args.phone === '' ? customers.phone : args.phone,
        updatedAt: new Date(),
      },
    })
    .returning({ id: customers.id })

  const row = rows[0]
  if (!row) throw new Error('Customer upsert returned no row')
  return row.id
}

async function insertOrderWithRetry(
  db: Database,
  args: {
    customerId: string
    email: string
    name: string
    phone: string
    breakdown: PriceBreakdown
    snapshot: ReturnType<typeof toOrderItemSnapshot>
    idempotencyKey: string
    attribution: Record<string, string>
  },
): Promise<{ orderId: string; orderNumber: string; raced: boolean }> {
  const { breakdown, snapshot } = args

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = generateOrderNumber()
    try {
      return await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(orders)
          .values({
            orderNumber,
            customerId: args.customerId,
            email: args.email,
            name: args.name,
            phone: args.phone,
            status: 'pending',
            subtotalPoisha: breakdown.subtotal,
            discountPoisha: breakdown.discount,
            shippingPoisha: breakdown.shipping,
            taxPoisha: breakdown.tax,
            totalPoisha: breakdown.total,
            currency: breakdown.currency,
            couponCode: breakdown.appliedCouponCode,
            idempotencyKey: args.idempotencyKey,
            attribution: args.attribution,
          })
          .returning({ id: orders.id, orderNumber: orders.orderNumber })

        const order = inserted[0]
        if (!order) throw new Error('Order insert returned no row')

        await tx.insert(orderItems).values({
          orderId: order.id,
          productSku: snapshot.productSku,
          productTitle: snapshot.productTitle,
          offerCode: snapshot.offerCode,
          offerLabel: snapshot.offerLabel,
          quantity: snapshot.quantity,
          unitListPricePoisha: snapshot.unitListPrice,
          unitPricePoisha: snapshot.unitPrice,
          discountPoisha: snapshot.discount,
          shippingPoisha: snapshot.shipping,
          taxPoisha: snapshot.tax,
          lineTotalPoisha: snapshot.lineTotal,
          currency: snapshot.currency,
        })

        await tx.insert(checkoutSessions).values({
          orderId: order.id,
          email: args.email,
          name: args.name,
          phone: args.phone,
          offerCode: snapshot.offerCode,
          attribution: args.attribution,
          completed: false,
        })

        return { orderId: order.id, orderNumber: order.orderNumber, raced: false }
      })
    } catch (err) {
      // Someone else already used this idempotency key: not an error, a replay.
      if (isUniqueViolation(err, 'orders_idempotency_key_unique')) {
        return { orderId: '', orderNumber: '', raced: true }
      }
      // Order-number collision: 40 bits of entropy, so this is vanishingly
      // rare, but a retry is free and a failed checkout is not.
      if (isUniqueViolation(err, 'orders_order_number_unique')) {
        log.warn('checkout.order_number_collision', { attempt })
        continue
      }
      throw err
    }
  }

  throw new CheckoutError(
    'invalid_input',
    'অর্ডার তৈরি করা যায়নি। আবার চেষ্টা করুন।',
    'exhausted order number retries',
  )
}
