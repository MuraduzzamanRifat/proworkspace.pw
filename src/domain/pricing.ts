/**
 * Server-authoritative pricing.
 *
 * The browser is allowed to DISPLAY a price. It is never allowed to DETERMINE
 * one. The checkout API accepts an offer code and an optional coupon code and
 * nothing else — no amounts, no totals, no line items. Everything payable is
 * recomputed here from database records immediately before the charge is
 * created, and the resulting snapshot is what gets written to the order.
 *
 * These functions are pure. They take the offer and coupon rows as arguments
 * rather than querying, so the whole engine is unit-testable with no database
 * and no network.
 */

import {
  add,
  percentOf,
  poisha,
  subtractFloorZero,
  type Poisha,
} from '@/domain/money'

export interface PricingOffer {
  code: string
  label: string
  /** Struck-through "before" price. Equal to `price` when there is no discount. */
  listPrice: Poisha
  /** The real price of one unit. */
  price: Poisha
  active: boolean
}

export type CouponKind = 'percent' | 'fixed'

export interface PricingCoupon {
  code: string
  kind: CouponKind
  /** Percent (0-100) when kind is 'percent'; poisha when kind is 'fixed'. */
  value: number
  /** Minimum subtotal for the coupon to apply. */
  minOrder: Poisha
  expiresAt: Date | null
  /** null = unlimited. */
  maxRedemptions: number | null
  timesRedeemed: number
  active: boolean
}

export type CouponRejection =
  | 'unknown'
  | 'inactive'
  | 'expired'
  | 'exhausted'
  | 'below_minimum'

export interface PriceBreakdown {
  offerCode: string
  offerLabel: string
  quantity: number
  unitListPrice: Poisha
  unitPrice: Poisha
  /** unitPrice * quantity, before any coupon. */
  subtotal: Poisha
  discount: Poisha
  /** Set only when a coupon was actually applied. */
  appliedCouponCode: string | null
  /** Set only when a coupon was supplied and refused. Never blocks checkout. */
  couponRejection: CouponRejection | null
  /** Always zero for a digital download. Kept so the shape survives a physical SKU. */
  shipping: Poisha
  tax: Poisha
  total: Poisha
  currency: 'BDT'
}

export class PricingError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PricingError'
    this.code = code
  }
}

/**
 * Digital downloads are sold one per order.
 *
 * A second copy of the same PDF confers nothing — the download grant and the
 * delivery email are per-order, not per-unit — so allowing quantity 2 would
 * take twice the money for exactly the same entitlement. If gifting is wanted
 * later it needs its own flow with a separate recipient email, not a quantity
 * bump.
 */
export const MAX_QUANTITY_DIGITAL = 1

export interface CalculateInput {
  offer: PricingOffer
  quantity?: number
  coupon?: PricingCoupon | null
  /** Present but unresolved coupon code, so we can report 'unknown'. */
  attemptedCouponCode?: string | null
  /** Injected for deterministic tests. */
  now?: Date
  /** Fraction, e.g. 0.15 for 15%. Default 0: see note below. */
  taxRate?: number
}

/**
 * Tax defaults to zero.
 *
 * Bangladesh VAT treatment of a locally sold digital book is a question for the
 * owner's accountant and depends on VAT registration (BIN) status. Inventing a
 * rate would put a wrong number on a real invoice, so the engine supports tax
 * fully and applies none until someone sets it deliberately.
 */
export function calculatePrice(input: CalculateInput): PriceBreakdown {
  const {
    offer,
    coupon = null,
    attemptedCouponCode = null,
    now = new Date(),
    taxRate = 0,
  } = input

  if (!offer.active) {
    throw new PricingError('offer_inactive', `Offer ${offer.code} is not active`)
  }

  const requested = input.quantity ?? 1
  if (!Number.isInteger(requested) || requested < 1) {
    throw new PricingError('bad_quantity', `Quantity must be a positive integer, got ${requested}`)
  }
  if (requested > MAX_QUANTITY_DIGITAL) {
    throw new PricingError(
      'quantity_exceeds_max',
      `Digital downloads are limited to ${MAX_QUANTITY_DIGITAL} per order`,
    )
  }
  if (taxRate < 0 || taxRate > 1) {
    throw new PricingError('bad_tax_rate', `Tax rate must be a fraction between 0 and 1`)
  }

  const quantity = requested
  const subtotal = poisha(offer.price * quantity)

  const { discount, appliedCouponCode, couponRejection } = resolveCoupon({
    coupon,
    attemptedCouponCode,
    subtotal,
    now,
  })

  const afterDiscount = subtractFloorZero(subtotal, discount)

  // Digital: no shipping, ever.
  const shipping = poisha(0)

  const tax = taxRate === 0 ? poisha(0) : percentOf(afterDiscount, taxRate * 100)
  const total = add(add(afterDiscount, shipping), tax)

  return {
    offerCode: offer.code,
    offerLabel: offer.label,
    quantity,
    unitListPrice: offer.listPrice,
    unitPrice: offer.price,
    subtotal,
    discount,
    appliedCouponCode,
    couponRejection,
    shipping,
    tax,
    total,
    currency: 'BDT',
  }
}

function resolveCoupon(args: {
  coupon: PricingCoupon | null
  attemptedCouponCode: string | null
  subtotal: Poisha
  now: Date
}): {
  discount: Poisha
  appliedCouponCode: string | null
  couponRejection: CouponRejection | null
} {
  const { coupon, attemptedCouponCode, subtotal, now } = args
  const none = { discount: poisha(0), appliedCouponCode: null }

  if (!coupon) {
    // A code was typed but did not resolve to a row.
    if (attemptedCouponCode && attemptedCouponCode.trim() !== '') {
      return { ...none, couponRejection: 'unknown' }
    }
    return { ...none, couponRejection: null }
  }

  if (!coupon.active) return { ...none, couponRejection: 'inactive' }
  if (coupon.expiresAt !== null && coupon.expiresAt.getTime() <= now.getTime()) {
    return { ...none, couponRejection: 'expired' }
  }
  if (coupon.maxRedemptions !== null && coupon.timesRedeemed >= coupon.maxRedemptions) {
    return { ...none, couponRejection: 'exhausted' }
  }
  if (subtotal < coupon.minOrder) {
    return { ...none, couponRejection: 'below_minimum' }
  }

  const raw =
    coupon.kind === 'percent'
      ? percentOf(subtotal, coupon.value)
      : poisha(Math.trunc(coupon.value))

  // A discount larger than the subtotal clamps to the subtotal. It must never
  // produce a negative total, and it must never produce a refund.
  const discount = raw > subtotal ? subtotal : raw

  return { discount, appliedCouponCode: coupon.code, couponRejection: null }
}

/**
 * Immutable snapshot written to `order_items` at purchase time.
 *
 * Historical orders must never be reconstructed by joining back to the live
 * product row. When the price changes next month, every past order still shows
 * what was actually charged.
 */
export interface OrderItemSnapshot {
  productSku: string
  productTitle: string
  offerCode: string
  offerLabel: string
  quantity: number
  unitListPrice: number
  unitPrice: number
  discount: number
  shipping: number
  tax: number
  lineTotal: number
  currency: 'BDT'
}

export function toOrderItemSnapshot(
  breakdown: PriceBreakdown,
  product: { sku: string; title: string },
): OrderItemSnapshot {
  return {
    productSku: product.sku,
    productTitle: product.title,
    offerCode: breakdown.offerCode,
    offerLabel: breakdown.offerLabel,
    quantity: breakdown.quantity,
    unitListPrice: breakdown.unitListPrice,
    unitPrice: breakdown.unitPrice,
    discount: breakdown.discount,
    shipping: breakdown.shipping,
    tax: breakdown.tax,
    lineTotal: breakdown.total,
    currency: breakdown.currency,
  }
}
