import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  ORDER_STATES,
  IllegalTransitionError,
  allowedFrom,
  canTransition,
  countsAsRevenue,
  isEntitled,
  isTerminal,
  transition,
  type OrderState,
} from '../src/domain/order-state'

describe('happy path', () => {
  test('pending -> payment_pending -> paid -> fulfilled', () => {
    let s: OrderState = 'pending'
    s = transition(s, 'payment_pending')
    s = transition(s, 'paid')
    s = transition(s, 'fulfilled')
    assert.equal(s, 'fulfilled')
  })
})

describe('illegal transitions are refused', () => {
  test('an unpaid order cannot be refunded', () => {
    assert.throws(() => transition('pending', 'refunded'), IllegalTransitionError)
    assert.throws(() => transition('payment_pending', 'refunded'), IllegalTransitionError)
  })

  test('a cancelled order cannot become paid', () => {
    assert.throws(() => transition('cancelled', 'paid'), IllegalTransitionError)
  })

  test('a refunded order cannot be fulfilled again', () => {
    assert.throws(() => transition('refunded', 'fulfilled'), IllegalTransitionError)
  })

  test('an order cannot skip straight from pending to fulfilled without paying', () => {
    assert.throws(() => transition('pending', 'fulfilled'), IllegalTransitionError)
  })

  test('self-transitions are illegal, so double-processing cannot hide', () => {
    assert.throws(() => transition('paid', 'paid'), IllegalTransitionError)
    assert.throws(() => transition('fulfilled', 'fulfilled'), IllegalTransitionError)
  })

  test('the error names both ends, so logs are actionable', () => {
    try {
      transition('cancelled', 'paid')
      assert.fail('expected a throw')
    } catch (err) {
      assert.ok(err instanceof IllegalTransitionError)
      assert.equal(err.from, 'cancelled')
      assert.equal(err.to, 'paid')
      assert.match(err.message, /cancelled -> paid/)
    }
  })
})

describe('retry and refund paths', () => {
  test('a failed payment can be retried', () => {
    assert.ok(canTransition('payment_failed', 'payment_pending'))
  })

  test('a partial refund can later become a full refund', () => {
    assert.equal(transition('partially_refunded', 'refunded'), 'refunded')
  })

  test('a paid order can be refunded before it was ever fulfilled', () => {
    assert.equal(transition('paid', 'refunded'), 'refunded')
  })
})

describe('terminal states', () => {
  test('cancelled and refunded are terminal and have no exits', () => {
    for (const s of ['cancelled', 'refunded'] as const) {
      assert.ok(isTerminal(s))
      assert.deepEqual(allowedFrom(s), [])
    }
  })

  test('no other state is terminal', () => {
    const nonTerminal = ORDER_STATES.filter((s) => !isTerminal(s))
    for (const s of nonTerminal) {
      assert.ok(allowedFrom(s).length > 0, `${s} should have at least one exit`)
    }
  })
})

describe('entitlement and revenue', () => {
  test('entitlement begins at paid, not before', () => {
    assert.equal(isEntitled('pending'), false)
    assert.equal(isEntitled('payment_pending'), false)
    assert.equal(isEntitled('payment_failed'), false)
    assert.equal(isEntitled('paid'), true)
    assert.equal(isEntitled('fulfilled'), true)
  })

  test('a full refund revokes access, a partial one does not', () => {
    assert.equal(isEntitled('refunded'), false)
    assert.equal(isEntitled('partially_refunded'), true)
  })

  test('only settled states count as revenue', () => {
    const counted = ORDER_STATES.filter(countsAsRevenue)
    assert.deepEqual([...counted].sort(), ['fulfilled', 'paid', 'partially_refunded'])
  })
})

describe('machine integrity', () => {
  test('every declared target is itself a declared state', () => {
    for (const from of ORDER_STATES) {
      for (const to of allowedFrom(from)) {
        assert.ok(ORDER_STATES.includes(to), `${from} -> ${to} targets an unknown state`)
      }
    }
  })

  test('every state is reachable from pending', () => {
    const seen = new Set<OrderState>(['pending'])
    const queue: OrderState[] = ['pending']
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const next of allowedFrom(cur)) {
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    const unreachable = ORDER_STATES.filter((s) => !seen.has(s))
    assert.deepEqual(unreachable, [], `unreachable states: ${unreachable.join(', ')}`)
  })
})
