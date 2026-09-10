import { poisha, type Poisha } from '@/domain/money'
import { transition, type OrderState } from '@/domain/order-state'

/**
 * Refund arithmetic and the resulting state change.
 *
 * Pure, so the rules that protect the revenue record can be tested without a
 * database: a refund can never exceed the order total, can never be negative,
 * can never apply to an unpaid order, and the boundary between "partial" and
 * "full" is decided by arithmetic rather than by whoever fills in the form.
 *
 * The caller runs this inside a transaction with the order row locked, so
 * `alreadyRefunded` cannot go stale between the read and the write.
 */

export class RefundError extends Error {
  readonly code: 'bad_amount' | 'exceeds_total' | 'nothing_refundable'
  constructor(code: RefundError['code'], message: string) {
    super(message)
    this.name = 'RefundError'
    this.code = code
  }
}

export interface RefundDecision {
  /** Cumulative refunded amount after this refund. */
  newRefundedTotal: Poisha
  nextStatus: OrderState
  /** True when this refund settles the whole order. */
  isFullRefund: boolean
  /** What remains refundable afterwards. */
  remainingRefundable: Poisha
}

export function decideRefund(args: {
  currentStatus: OrderState
  orderTotal: Poisha
  alreadyRefunded: Poisha
  amount: Poisha
}): RefundDecision {
  const { currentStatus, orderTotal, alreadyRefunded, amount } = args

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RefundError('bad_amount', 'Refund amount must be a positive whole number of poisha')
  }
  if (alreadyRefunded >= orderTotal) {
    throw new RefundError('nothing_refundable', 'This order is already fully refunded')
  }

  const newRefundedTotal = alreadyRefunded + amount
  if (newRefundedTotal > orderTotal) {
    throw new RefundError(
      'exceeds_total',
      `Refund of ${amount} would bring the total to ${newRefundedTotal}, above the order total of ${orderTotal}`,
    )
  }

  const isFullRefund = newRefundedTotal === orderTotal
  const target: OrderState = isFullRefund ? 'refunded' : 'partially_refunded'

  // Throws IllegalTransitionError if the order was never paid, or is already
  // terminal. That is the guard against refunding a cancelled order.
  const nextStatus = transition(currentStatus, target)

  return {
    newRefundedTotal: poisha(newRefundedTotal),
    nextStatus,
    isFullRefund,
    remainingRefundable: poisha(orderTotal - newRefundedTotal),
  }
}
