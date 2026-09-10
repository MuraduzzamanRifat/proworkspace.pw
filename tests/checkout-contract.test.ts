import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_ATTRIBUTION_KEYS,
  checkoutBodySchema,
  limitAttribution,
} from '../src/services/checkout-contract'

const valid = {
  offerCode: 'standard',
  name: 'পরীক্ষা',
  email: 'buyer@example.com',
  idempotencyKey: 'abcdefgh12345678',
}

describe('the client cannot influence price over the wire', () => {
  /**
   * This is the security property the whole pricing design rests on. If
   * someone later adds a price-shaped field to the request schema, this test
   * is what fails.
   */
  const priceFields = [
    'total',
    'amount',
    'unitPrice',
    'price',
    'subtotal',
    'discount',
    'currency',
    'totalPoisha',
  ]

  for (const field of priceFields) {
    test(`a body carrying "${field}" has it stripped before parsing`, () => {
      const parsed = checkoutBodySchema.parse({ ...valid, [field]: 1 })
      assert.equal(
        field in parsed,
        false,
        `"${field}" survived validation and could reach the pricing engine`,
      )
    })
  }

  test('the parsed body contains only the expected keys', () => {
    const parsed = checkoutBodySchema.parse({
      ...valid,
      total: 1,
      admin: true,
      role: 'super_admin',
    })
    assert.deepEqual(
      Object.keys(parsed).sort(),
      ['attribution', 'email', 'idempotencyKey', 'name', 'offerCode', 'phone'].sort(),
    )
  })

  test('a privilege-shaped field cannot be mass-assigned', () => {
    const parsed = checkoutBodySchema.parse({ ...valid, role: 'super_admin', isAdmin: true })
    assert.equal('role' in parsed, false)
    assert.equal('isAdmin' in parsed, false)
  })
})

describe('validation', () => {
  test('accepts a minimal valid body', () => {
    const parsed = checkoutBodySchema.parse(valid)
    assert.equal(parsed.offerCode, 'standard')
    assert.equal(parsed.phone, '')
    assert.deepEqual(parsed.attribution, {})
  })

  test('rejects a malformed email', () => {
    const result = checkoutBodySchema.safeParse({ ...valid, email: 'not-an-email' })
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.error.issues[0]?.message, 'সঠিক ইমেইল দিন')
    }
  })

  test('rejects an empty name', () => {
    const result = checkoutBodySchema.safeParse({ ...valid, name: '' })
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.error.issues[0]?.message, 'নাম দিন')
    }
  })

  test('every user-facing validation message is Bengali, not raw validator English', () => {
    const badBodies = [
      { ...valid, email: 'x' },
      { ...valid, name: '' },
      { ...valid, idempotencyKey: 'short' },
      { ...valid, offerCode: '' },
      { ...valid, name: 'x'.repeat(200) },
    ]

    for (const body of badBodies) {
      const result = checkoutBodySchema.safeParse(body)
      assert.equal(result.success, false)
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? ''
        // Any Bengali codepoint proves it is not a default zod string.
        assert.match(
          message,
          /[ঀ-৿]/,
          `leaked a non-Bengali validator message: ${message}`,
        )
      }
    }
  })
})

describe('attribution limits', () => {
  test('caps the number of keys stored', () => {
    const wide: Record<string, string> = {}
    for (let i = 0; i < 100; i += 1) wide[`k${i}`] = 'v'
    assert.equal(Object.keys(limitAttribution(wide)).length, MAX_ATTRIBUTION_KEYS)
  })

  test('rejects an oversized attribution value', () => {
    const result = checkoutBodySchema.safeParse({
      ...valid,
      attribution: { utm_source: 'x'.repeat(500) },
    })
    assert.equal(result.success, false)
  })

  test('passes normal campaign parameters through', () => {
    const parsed = checkoutBodySchema.parse({
      ...valid,
      attribution: { first_utm_source: 'facebook', last_utm_campaign: 'launch' },
    })
    assert.equal(parsed.attribution['first_utm_source'], 'facebook')
  })
})
