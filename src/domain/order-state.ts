/**
 * Order state machine.
 *
 * Every order status change in the system goes through `transition()`. There is
 * no `UPDATE orders SET status = ...` anywhere else. The point is that an
 * illegal move — refunding an unpaid order, marking a cancelled order paid,
 * re-fulfilling something already refunded — fails loudly at the boundary
 * instead of quietly corrupting the revenue record.
 *
 * The state set is deliberately smaller than a physical-goods funnel: this is a
 * digital download, so there is no `shipped` and no `out_for_delivery`.
 * `fulfilled` means the download grant exists and the delivery email was
 * handed to the mail provider.
 */

export const ORDER_STATES = [
  /** Row exists, nothing has been sent to the gateway yet. */
  'pending',
  /** Customer has been handed off to the gateway; awaiting their action. */
  'payment_pending',
  /** Gateway confirmed money received. Verified server-side, never from the browser. */
  'paid',
  /** Download grant issued and delivery email dispatched. */
  'fulfilled',
  /** Gateway reported a failed or declined attempt. Retryable. */
  'payment_failed',
  /** Abandoned or explicitly cancelled before payment. Terminal. */
  'cancelled',
  /** Full refund issued. Terminal. */
  'refunded',
  /** Part of the amount refunded. Can still become fully refunded. */
  'partially_refunded',
] as const

export type OrderState = (typeof ORDER_STATES)[number]

/** States from which no further transition is possible. */
export const TERMINAL_STATES: readonly OrderState[] = ['cancelled', 'refunded'] as const

/**
 * Allowed moves. Anything not listed here is rejected.
 *
 * Note `paid -> paid` and `fulfilled -> fulfilled` are absent on purpose.
 * Duplicate webhooks are handled by idempotency (src/domain/idempotency.ts)
 * BEFORE a transition is attempted, so a repeat delivery is a no-op rather than
 * a self-transition. Making them legal here would hide double-processing bugs.
 */
const ALLOWED: Readonly<Record<OrderState, readonly OrderState[]>> = {
  pending: ['payment_pending', 'payment_failed', 'cancelled'],
  payment_pending: ['paid', 'payment_failed', 'cancelled'],
  payment_failed: ['payment_pending', 'cancelled'],
  paid: ['fulfilled', 'refunded', 'partially_refunded'],
  fulfilled: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded'],
  cancelled: [],
  refunded: [],
}

export class IllegalTransitionError extends Error {
  readonly from: OrderState
  readonly to: OrderState

  constructor(from: OrderState, to: OrderState) {
    super(`Illegal order transition: ${from} -> ${to}`)
    this.name = 'IllegalTransitionError'
    this.from = from
    this.to = to
  }
}

export function isTerminal(state: OrderState): boolean {
  return TERMINAL_STATES.includes(state)
}

export function canTransition(from: OrderState, to: OrderState): boolean {
  return ALLOWED[from].includes(to)
}

export function allowedFrom(from: OrderState): readonly OrderState[] {
  return ALLOWED[from]
}

/**
 * Apply a transition, or throw.
 *
 * Returns the new state so callers can write
 * `const next = transition(order.status, 'paid')`.
 */
export function transition(from: OrderState, to: OrderState): OrderState {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to)
  }
  return to
}

/** True once the customer is entitled to the product. */
export function isEntitled(state: OrderState): boolean {
  // A partial refund on a digital product still leaves the buyer with the file,
  // so entitlement survives it. A full refund revokes access.
  return state === 'paid' || state === 'fulfilled' || state === 'partially_refunded'
}

/** True when the order counts toward revenue reporting. */
export function countsAsRevenue(state: OrderState): boolean {
  return state === 'paid' || state === 'fulfilled' || state === 'partially_refunded'
}

/** Bengali labels for the admin UI and customer-facing status text. */
export const STATE_LABELS_BN: Readonly<Record<OrderState, string>> = {
  pending: 'অপেক্ষমাণ',
  payment_pending: 'পেমেন্ট চলছে',
  paid: 'পেমেন্ট সম্পন্ন',
  fulfilled: 'ডেলিভারি সম্পন্ন',
  payment_failed: 'পেমেন্ট ব্যর্থ',
  cancelled: 'বাতিল',
  refunded: 'ফেরত দেওয়া হয়েছে',
  partially_refunded: 'আংশিক ফেরত',
}
