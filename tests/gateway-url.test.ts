import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { normaliseGatewayBase } from '../src/config/env'

describe('gateway base URL normalisation', () => {
  const cases: Array<[string, string]> = [
    ['https://sandbox.uddoktapay.com', 'https://sandbox.uddoktapay.com'],
    ['https://sandbox.uddoktapay.com/', 'https://sandbox.uddoktapay.com'],
    ['https://panel.example.io/api', 'https://panel.example.io'],
    ['https://panel.example.io/api/', 'https://panel.example.io'],
    ['https://panel.example.io/API', 'https://panel.example.io'],
    ['  https://panel.example.io/api//  ', 'https://panel.example.io'],
  ]

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(normaliseGatewayBase(input), expected)
    })
  }

  test('does not strip a path segment that merely contains "api"', () => {
    assert.equal(normaliseGatewayBase('https://api.example.io'), 'https://api.example.io')
    assert.equal(normaliseGatewayBase('https://x.io/rapid'), 'https://x.io/rapid')
  })

  test('the resulting endpoints never contain /api/api', () => {
    const base = normaliseGatewayBase('https://panel.example.io/api')
    assert.equal(`${base}/api/checkout-v2`, 'https://panel.example.io/api/checkout-v2')
  })
})
