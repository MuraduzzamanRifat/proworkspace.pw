import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  add,
  formatBdt,
  fromGatewayAmount,
  percentOf,
  poisha,
  subtractFloorZero,
  taka,
  toBengaliDigits,
  toGatewayAmount,
} from '../src/domain/money'

describe('poisha construction', () => {
  test('accepts non-negative safe integers', () => {
    assert.equal(poisha(0), 0)
    assert.equal(poisha(199000), 199000)
  })

  test('rejects fractional values, which is the whole point', () => {
    assert.throws(() => poisha(10.5), RangeError)
    assert.throws(() => poisha(0.1 + 0.2), RangeError)
  })

  test('rejects negative amounts', () => {
    assert.throws(() => poisha(-1), RangeError)
  })

  test('rejects unsafe integers', () => {
    assert.throws(() => poisha(Number.MAX_SAFE_INTEGER + 2), RangeError)
  })
})

describe('taka to poisha', () => {
  test('converts the real product price', () => {
    assert.equal(taka(1990), 199000)
  })

  test('handles two decimal places', () => {
    assert.equal(taka(19.99), 1999)
  })

  test('rejects sub-poisha precision instead of silently rounding money away', () => {
    assert.throws(() => taka(10.001), RangeError)
  })

  test('avoids the classic float error', () => {
    // 0.1 + 0.2 = 0.30000000000000004; taka() must still land on 30 poisha.
    assert.equal(taka(0.1 + 0.2), 30)
  })
})

describe('arithmetic', () => {
  test('add', () => {
    assert.equal(add(poisha(100), poisha(250)), 350)
  })

  test('subtraction floors at zero rather than going negative', () => {
    assert.equal(subtractFloorZero(poisha(100), poisha(250)), 0)
    assert.equal(subtractFloorZero(poisha(250), poisha(100)), 150)
  })

  test('percentOf rounds half-up', () => {
    // 199000 * 15% = 29850 exactly
    assert.equal(percentOf(poisha(199000), 15), 29850)
    // 101 * 50% = 50.5 -> 51
    assert.equal(percentOf(poisha(101), 50), 51)
  })

  test('percentOf rejects out-of-range percentages', () => {
    assert.throws(() => percentOf(poisha(100), -1), RangeError)
    assert.throws(() => percentOf(poisha(100), 101), RangeError)
  })
})

describe('gateway amount round-trip', () => {
  test('formats poisha as a decimal taka string', () => {
    assert.equal(toGatewayAmount(poisha(199000)), '1990.00')
    assert.equal(toGatewayAmount(poisha(1999)), '19.99')
    assert.equal(toGatewayAmount(poisha(5)), '0.05')
  })

  test('parses a gateway string back to the identical poisha value', () => {
    for (const amount of [0, 5, 1999, 199000, 123456]) {
      const round = fromGatewayAmount(toGatewayAmount(poisha(amount)))
      assert.equal(round, amount, `round-trip failed for ${amount}`)
    }
  })

  test('accepts the shapes a gateway actually sends', () => {
    assert.equal(fromGatewayAmount('1990'), 199000)
    assert.equal(fromGatewayAmount('1990.0'), 199000)
    assert.equal(fromGatewayAmount('1990.00'), 199000)
    assert.equal(fromGatewayAmount(' 1990.00 '), 199000)
  })

  test('rejects junk rather than coercing it to a number', () => {
    assert.throws(() => fromGatewayAmount('abc'), RangeError)
    assert.throws(() => fromGatewayAmount('-10'), RangeError)
    assert.throws(() => fromGatewayAmount('19.999'), RangeError)
    assert.throws(() => fromGatewayAmount(''), RangeError)
  })
})

describe('Bengali display', () => {
  test('converts digits', () => {
    assert.equal(toBengaliDigits('1990'), '১৯৯০')
    assert.equal(toBengaliDigits('2026-09-10'), '২০২৬-০৯-১০')
  })

  test('renders the product price exactly as the back cover prints it', () => {
    assert.equal(formatBdt(taka(1990)), '৳১,৯৯০')
  })

  test('uses South Asian lakh grouping, not Western thousands', () => {
    // 100000 is one lakh: ১,০০,০০০ — not ১০০,০০০
    assert.equal(formatBdt(taka(100000), { bengali: false }), '৳1,00,000')
    assert.equal(formatBdt(taka(1234567), { bengali: false }), '৳12,34,567')
  })

  test('omits poisha when zero and shows them when not', () => {
    assert.equal(formatBdt(taka(1990), { bengali: false }), '৳1,990')
    assert.equal(formatBdt(poisha(199050), { bengali: false }), '৳1,990.50')
  })

  test('small amounts are not grouped', () => {
    assert.equal(formatBdt(taka(999), { bengali: false }), '৳999')
  })
})
