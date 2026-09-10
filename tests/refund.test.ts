import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { taka, poisha } from '../src/domain/money'
import { IllegalTransitionError } from '../src/domain/order-state'
import { RefundError, decideRefund } from '../src/domain/refund'

const TOTAL = taka(1990) // 199000 poisha

describe('full refunds', () => {
  test('refunding the whole amount marks the order refunded', () => {
    const d = decideRefund({
      currentStatus: 'fulfilled',
      orderTotal: TOTAL,
      alreadyRefunded: poisha(0),
      amount: TOTAL,
    })
    assert.equal(d.nextStatus, 'refunded')
    assert.equal(d.isFullRefund, true)
    assert.equal(d.newRefundedTotal, 199000)
    assert.equal(d.remainingRefundable, 0)
  })

  test('a paid but unfulfilled order can be refunded', () => {
    const d = decideRefund({
      currentStatus: 'paid',
      orderTotal: TOTAL,
      alreadyRefunded: poisha(0),
      amount: TOTAL,
    })
    assert.equal(d.nextStatus, 'refunded')
  })
})

describe('partial refunds', () => {
  test('a part refund marks the order partially refunded', () => {
    const d = decideRefund({
      currentStatus: 'fulfilled',
      orderTotal: TOTAL,
      alreadyRefunded: poisha(0),
      amount: taka(500),
    })
    assert.equal(d.nextStatus, 'partially_refunded')
    assert.equal(d.isFullRefund, false)
    assert.equal(d.newRefundedTotal, 50000)
    assert.equal(d.remainingRefundable, 149000)
  })

  test('successive partials accumulate and settle exactly at the total', () => {
    let refunded = poisha(0)
    const first = decideRefund({
      currentStatus: 'fulfilled',
      orderTotal: TOTAL,
      alreadyRefunded: refunded,
      amount: taka(990),
    })
    refunded = first.newRefundedTotal
    assert.equal(first.nextStatus, 'partially_refunded')

    const second = decideRefund({
      currentStatus: 'partially_refunded',
      orderTotal: TOTAL,
      alreadyRefunded: refunded,
      amount: taka(1000),
    })
    assert.equal(second.nextStatus, 'refunded')
    assert.equal(second.newRefundedTotal, 199000)
    assert.equal(second.remainingRefundable, 0)
  })

  test('a partial refund of one poisha short is still partial, not full', () => {
    const d = decideRefund({
      currentStatus: 'fulfilled',
      orderTotal: TOTAL,
      alreadyRefunded: poisha(0),
      amount: poisha(198999),
    })
    assert.equal(d.nextStatus, 'partially_refunded')
    assert.equal(d.remainingRefundable, 1)
  })
})

describe('the revenue record cannot be corrupted', () => {
  test('refunding more than the total is refused', () => {
    assert.throws(
      () =>
        decideRefund({
          currentStatus: 'fulfilled',
          orderTotal: TOTAL,
          alreadyRefunded: poisha(0),
          amount: taka(2000),
        }),
      (e: unknown) => e instanceof RefundError && e.code === 'exceeds_total',
    )
  })

  test('a second refund cannot push the cumulative total past the order total', () => {
    assert.throws(
      () =>
        decideRefund({
          currentStatus: 'partially_refunded',
          orderTotal: TOTAL,
          alreadyRefunded: taka(1500),
          amount: taka(600),
        }),
      (e: unknown) => e instanceof RefundError && e.code === 'exceeds_total',
    )
  })

  test('an already fully refunded order refuses another refund', () => {
    assert.throws(
      () =>
        decideRefund({
          currentStatus: 'refunded',
          orderTotal: TOTAL,
          alreadyRefunded: TOTAL,
          amount: poisha(1),
        }),
      (e: unknown) => e instanceof RefundError && e.code === 'nothing_refundable',
    )
  })

  test('zero and negative amounts are refused', () => {
    for (const amount of [0, -1]) {
      assert.throws(
        () =>
          decideRefund({
            currentStatus: 'fulfilled',
            orderTotal: TOTAL,
            alreadyRefunded: poisha(0),
            amount: amount as ReturnType<typeof poisha>,
          }),
        (e: unknown) => e instanceof RefundError && e.code === 'bad_amount',
      )
    }
  })

  test('a fractional amount is refused rather than silently rounded', () => {
    assert.throws(
      () =>
        decideRefund({
          currentStatus: 'fulfilled',
          orderTotal: TOTAL,
          alreadyRefunded: poisha(0),
          amount: 10.5 as ReturnType<typeof poisha>,
        }),
      (e: unknown) => e instanceof RefundError && e.code === 'bad_amount',
    )
  })
})

describe('refunds respect the state machine', () => {
  test('an unpaid order cannot be refunded', () => {
    for (const status of ['pending', 'payment_pending', 'payment_failed'] as const) {
      assert.throws(
        () =>
          decideRefund({
            currentStatus: status,
            orderTotal: TOTAL,
            alreadyRefunded: poisha(0),
            amount: taka(100),
          }),
        IllegalTransitionError,
        `${status} should not be refundable`,
      )
    }
  })

  test('a cancelled order cannot be refunded', () => {
    assert.throws(
      () =>
        decideRefund({
          currentStatus: 'cancelled',
          orderTotal: TOTAL,
          alreadyRefunded: poisha(0),
          amount: taka(100),
        }),
      IllegalTransitionError,
    )
  })
})
