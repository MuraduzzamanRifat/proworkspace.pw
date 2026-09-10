import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { taka, poisha } from '../src/domain/money'
import {
  MAX_QUANTITY_DIGITAL,
  PricingError,
  calculatePrice,
  toOrderItemSnapshot,
  type PricingCoupon,
  type PricingOffer,
} from '../src/domain/pricing'

const OFFER: PricingOffer = {
  code: 'standard',
  label: 'সম্পূর্ণ বই + ওয়ার্কফ্লো + প্রম্পট',
  listPrice: taka(1990),
  price: taka(1990),
  active: true,
}

const NOW = new Date('2026-09-10T00:00:00.000Z')

function coupon(over: Partial<PricingCoupon> = {}): PricingCoupon {
  return {
    code: 'LAUNCH',
    kind: 'percent',
    value: 20,
    minOrder: poisha(0),
    expiresAt: null,
    maxRedemptions: null,
    timesRedeemed: 0,
    active: true,
    ...over,
  }
}

describe('base price', () => {
  test('an uncouponed order costs exactly the offer price', () => {
    const b = calculatePrice({ offer: OFFER, now: NOW })
    assert.equal(b.subtotal, 199000)
    assert.equal(b.discount, 0)
    assert.equal(b.shipping, 0)
    assert.equal(b.tax, 0)
    assert.equal(b.total, 199000)
    assert.equal(b.currency, 'BDT')
  })

  test('a digital product never accrues shipping', () => {
    const b = calculatePrice({ offer: OFFER, now: NOW })
    assert.equal(b.shipping, 0)
  })

  test('tax is zero until someone deliberately sets a rate', () => {
    assert.equal(calculatePrice({ offer: OFFER, now: NOW }).tax, 0)
    const taxed = calculatePrice({ offer: OFFER, now: NOW, taxRate: 0.15 })
    assert.equal(taxed.tax, 29850)
    assert.equal(taxed.total, 199000 + 29850)
  })
})

describe('the client cannot set the price', () => {
  test('calculatePrice refuses a caller-supplied total', () => {
    // Structural guard: if someone adds an `amount` or `total` input later,
    // this test is the thing that should make them stop and think.
    // @ts-expect-error - the input shape must not accept a total
    const b = calculatePrice({ offer: OFFER, now: NOW, total: 1 })
    assert.equal(b.total, 199000)
  })

  test('calculatePrice refuses a caller-supplied unit price', () => {
    // @ts-expect-error - the input shape must not accept a unit price
    const b = calculatePrice({ offer: OFFER, now: NOW, unitPrice: 1 })
    assert.equal(b.total, 199000)
  })

  test('an inactive offer cannot be bought at all', () => {
    assert.throws(
      () => calculatePrice({ offer: { ...OFFER, active: false }, now: NOW }),
      (err: unknown) => err instanceof PricingError && err.code === 'offer_inactive',
    )
  })
})

describe('quantity', () => {
  test('defaults to one', () => {
    assert.equal(calculatePrice({ offer: OFFER, now: NOW }).quantity, 1)
  })

  test('refuses more than one copy of a download', () => {
    assert.throws(
      () => calculatePrice({ offer: OFFER, quantity: MAX_QUANTITY_DIGITAL + 1, now: NOW }),
      (err: unknown) => err instanceof PricingError && err.code === 'quantity_exceeds_max',
    )
  })

  test('refuses zero, negative and fractional quantities', () => {
    for (const q of [0, -1, 1.5]) {
      assert.throws(
        () => calculatePrice({ offer: OFFER, quantity: q, now: NOW }),
        (err: unknown) => err instanceof PricingError && err.code === 'bad_quantity',
        `quantity ${q} should be refused`,
      )
    }
  })
})

describe('coupons', () => {
  test('a percentage coupon discounts the subtotal', () => {
    const b = calculatePrice({ offer: OFFER, coupon: coupon({ value: 20 }), now: NOW })
    assert.equal(b.discount, 39800)
    assert.equal(b.total, 159200)
    assert.equal(b.appliedCouponCode, 'LAUNCH')
    assert.equal(b.couponRejection, null)
  })

  test('a fixed coupon discounts a flat number of poisha', () => {
    const b = calculatePrice({
      offer: OFFER,
      coupon: coupon({ kind: 'fixed', value: taka(500) }),
      now: NOW,
    })
    assert.equal(b.discount, 50000)
    assert.equal(b.total, 149000)
  })

  test('a discount larger than the order clamps to zero, never negative', () => {
    const b = calculatePrice({
      offer: OFFER,
      coupon: coupon({ kind: 'fixed', value: taka(999999) }),
      now: NOW,
    })
    assert.equal(b.total, 0)
    assert.ok(b.total >= 0)
  })

  test('a 100 percent coupon zeroes the total without breaking', () => {
    const b = calculatePrice({ offer: OFFER, coupon: coupon({ value: 100 }), now: NOW })
    assert.equal(b.discount, 199000)
    assert.equal(b.total, 0)
  })
})

describe('coupon rejection reasons', () => {
  const cases: Array<[string, Partial<PricingCoupon>, string]> = [
    ['expired', { expiresAt: new Date('2026-09-09T23:59:59.000Z') }, 'expired'],
    ['inactive', { active: false }, 'inactive'],
    ['exhausted', { maxRedemptions: 10, timesRedeemed: 10 }, 'exhausted'],
    ['below minimum', { minOrder: taka(5000) }, 'below_minimum'],
  ]

  for (const [name, over, expected] of cases) {
    test(`a ${name} coupon is refused, and the order still prices correctly`, () => {
      const b = calculatePrice({ offer: OFFER, coupon: coupon(over), now: NOW })
      assert.equal(b.couponRejection, expected)
      assert.equal(b.discount, 0)
      assert.equal(b.appliedCouponCode, null)
      // The key property: a bad coupon must not block the sale.
      assert.equal(b.total, 199000)
    })
  }

  test('a coupon expiring exactly now is expired', () => {
    const b = calculatePrice({ offer: OFFER, coupon: coupon({ expiresAt: NOW }), now: NOW })
    assert.equal(b.couponRejection, 'expired')
  })

  test('a coupon expiring one second from now still applies', () => {
    const later = new Date(NOW.getTime() + 1000)
    const b = calculatePrice({ offer: OFFER, coupon: coupon({ expiresAt: later }), now: NOW })
    assert.equal(b.couponRejection, null)
    assert.equal(b.appliedCouponCode, 'LAUNCH')
  })

  test('an unknown code is reported without blocking checkout', () => {
    const b = calculatePrice({
      offer: OFFER,
      coupon: null,
      attemptedCouponCode: 'NOPE',
      now: NOW,
    })
    assert.equal(b.couponRejection, 'unknown')
    assert.equal(b.total, 199000)
  })

  test('no coupon at all is not a rejection', () => {
    const b = calculatePrice({ offer: OFFER, now: NOW })
    assert.equal(b.couponRejection, null)
  })

  test('an empty coupon string is treated as no coupon', () => {
    const b = calculatePrice({ offer: OFFER, attemptedCouponCode: '   ', now: NOW })
    assert.equal(b.couponRejection, null)
  })
})

describe('order item snapshot', () => {
  test('captures what was charged, not a pointer to the live product', () => {
    const b = calculatePrice({ offer: OFFER, coupon: coupon({ value: 20 }), now: NOW })
    const snap = toOrderItemSnapshot(b, { sku: 'CRS-EBOOK-AIAGENT-BN-001', title: 'এআই এজেন্ট দিয়ে ইনকাম' })

    assert.equal(snap.productSku, 'CRS-EBOOK-AIAGENT-BN-001')
    assert.equal(snap.productTitle, 'এআই এজেন্ট দিয়ে ইনকাম')
    assert.equal(snap.unitPrice, 199000)
    assert.equal(snap.discount, 39800)
    assert.equal(snap.lineTotal, 159200)
    assert.equal(snap.currency, 'BDT')
  })

  test('a later price change cannot alter an existing snapshot', () => {
    const snap = toOrderItemSnapshot(calculatePrice({ offer: OFFER, now: NOW }), {
      sku: 'X',
      title: 'T',
    })
    const before = snap.lineTotal

    // Simulate the owner raising the price tomorrow.
    const raised: PricingOffer = { ...OFFER, price: taka(2490), listPrice: taka(2490) }
    const newBreakdown = calculatePrice({ offer: raised, now: NOW })

    assert.equal(newBreakdown.total, 249000)
    assert.equal(snap.lineTotal, before, 'the old snapshot must be untouched')
    assert.equal(snap.lineTotal, 199000)
  })
})

describe('input validation', () => {
  test('a nonsense tax rate is refused', () => {
    for (const rate of [-0.1, 1.5]) {
      assert.throws(
        () => calculatePrice({ offer: OFFER, now: NOW, taxRate: rate }),
        (err: unknown) => err instanceof PricingError && err.code === 'bad_tax_rate',
      )
    }
  })
})
