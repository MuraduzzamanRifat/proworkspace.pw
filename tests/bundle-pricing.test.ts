import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  DELIVERABLES,
  OFFERS,
  PRODUCT,
  defaultOffer,
  savingPercent,
  separateValueTotal,
} from '../src/config/product'
import { formatBdt } from '../src/domain/money'

/**
 * The bundle's headline numbers are arithmetic, not marketing. These tests
 * make sure they stay that way: if someone types a list price instead of
 * deriving it, or changes a component price without the total following, the
 * page would start showing a saving that is not true.
 */
describe('bundle pricing is derived, not typed', () => {
  test('the list price is exactly the sum of the separate prices', () => {
    const sum = DELIVERABLES.reduce((acc, d) => acc + d.separateValue, 0)
    assert.equal(separateValueTotal(), sum)
    assert.equal(defaultOffer().listPrice, sum)
  })

  test('the components are the three the page advertises, at their real separate prices', () => {
    assert.deepEqual(
      DELIVERABLES.map((d) => [d.key, d.separateValue]),
      [
        ['ebook', 199000],
        ['workflows', 200000],
        ['leads', 149900],
      ],
    )
    assert.equal(separateValueTotal(), 548900)
    assert.equal(formatBdt(separateValueTotal()), '৳৫,৪৮৯')
  })

  test('the offer price is the owner’s live price, ৳999', () => {
    assert.equal(defaultOffer().price, 99900)
    assert.equal(formatBdt(defaultOffer().price), '৳৯৯৯')
  })

  test('the saving percentage is floored, so it never rounds up in our favour', () => {
    // (548900 - 99900) / 548900 = 81.80…% -> 81, and the page says "প্রায় ৮১%".
    assert.equal(savingPercent(), 81)
  })

  test('exactly one offer, marked default', () => {
    assert.equal(OFFERS.length, 1)
    assert.equal(OFFERS[0]!.isDefault, true)
  })

  test('every deliverable has a distinct key and a safe filename', () => {
    const keys = new Set(DELIVERABLES.map((d) => d.key))
    assert.equal(keys.size, DELIVERABLES.length)
    for (const d of DELIVERABLES) {
      assert.match(d.filename, /^[a-z0-9-]+\.(pdf|zip)$/, `unsafe filename ${d.filename}`)
    }
  })

  test('the product carries the same deliverables the pricing uses', () => {
    assert.deepEqual(
      PRODUCT.deliverables.map((d) => d.key),
      DELIVERABLES.map((d) => d.key),
    )
  })
})
