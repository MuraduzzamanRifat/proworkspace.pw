import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  TokenError,
  generateOrderNumber,
  randomId,
  safeEqual,
  sha256Hex,
  signToken,
  verifyToken,
} from '../src/lib/crypto'

const SECRET = 'a'.repeat(64)
const OTHER_SECRET = 'b'.repeat(64)
const future = () => Math.floor(Date.now() / 1000) + 3600

describe('signed tokens', () => {
  test('round-trips a payload', () => {
    const token = signToken({ sub: 'grant-1', exp: future(), kind: 'dl' }, SECRET)
    const payload = verifyToken(token, SECRET)
    assert.equal(payload.sub, 'grant-1')
    assert.equal(payload['kind'], 'dl')
  })

  test('rejects a token signed with a different secret', () => {
    const token = signToken({ sub: 'grant-1', exp: future() }, OTHER_SECRET)
    assert.throws(
      () => verifyToken(token, SECRET),
      (e: unknown) => e instanceof TokenError && e.reason === 'bad_signature',
    )
  })

  test('rejects a tampered payload', () => {
    const token = signToken({ sub: 'grant-1', exp: future() }, SECRET)
    const [, sig] = token.split('.') as [string, string]
    const forgedBody = Buffer.from(JSON.stringify({ sub: 'grant-999', exp: future() }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    assert.throws(
      () => verifyToken(`${forgedBody}.${sig}`, SECRET),
      (e: unknown) => e instanceof TokenError && e.reason === 'bad_signature',
    )
  })

  test('rejects a tampered signature', () => {
    const token = signToken({ sub: 'grant-1', exp: future() }, SECRET)
    const [body] = token.split('.') as [string, string]
    assert.throws(
      () => verifyToken(`${body}.notarealsignature`, SECRET),
      (e: unknown) => e instanceof TokenError && e.reason === 'bad_signature',
    )
  })

  test('rejects an expired token', () => {
    const token = signToken({ sub: 'grant-1', exp: Math.floor(Date.now() / 1000) - 1 }, SECRET)
    assert.throws(
      () => verifyToken(token, SECRET),
      (e: unknown) => e instanceof TokenError && e.reason === 'expired',
    )
  })

  test('treats expiry as inclusive so a token cannot linger a second too long', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const exp = Math.floor(now.getTime() / 1000)
    const token = signToken({ sub: 'x', exp }, SECRET)
    assert.throws(
      () => verifyToken(token, SECRET, now),
      (e: unknown) => e instanceof TokenError && e.reason === 'expired',
    )
  })

  test('rejects structurally malformed tokens', () => {
    for (const bad of ['', 'garbage', 'a.b.c', '.', 'onlyonepart']) {
      assert.throws(() => verifyToken(bad, SECRET), TokenError, `accepted ${JSON.stringify(bad)}`)
    }
  })

  test('refuses to sign or verify with an empty secret', () => {
    assert.throws(() => signToken({ sub: 'x', exp: future() }, ''), /empty secret/)
    assert.throws(() => verifyToken('a.b', ''), /empty secret/)
  })
})

describe('constant-time comparison', () => {
  test('matches equal strings', () => {
    assert.equal(safeEqual('abc123', 'abc123'), true)
  })

  test('rejects different strings of equal length', () => {
    assert.equal(safeEqual('abc123', 'abc124'), false)
  })

  test('rejects different lengths without throwing', () => {
    assert.equal(safeEqual('short', 'muchlongervalue'), false)
    assert.equal(safeEqual('', 'x'), false)
  })
})

describe('hashing and ids', () => {
  test('sha256 is stable and hex', () => {
    const a = sha256Hex('hello')
    assert.equal(a, sha256Hex('hello'))
    assert.match(a, /^[0-9a-f]{64}$/)
    assert.notEqual(a, sha256Hex('hellp'))
  })

  test('randomId does not repeat', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i += 1) seen.add(randomId(18))
    assert.equal(seen.size, 500)
  })
})

describe('order numbers', () => {
  test('follows the PREFIX-XXXXXXXX shape', () => {
    assert.match(generateOrderNumber(), /^CRS-[2-9A-HJ-NP-Z]{8}$/)
  })

  test('excludes characters that are ambiguous when read aloud', () => {
    // I, O, 0 and 1 are excluded so support cannot mis-transcribe a number.
    for (let i = 0; i < 300; i += 1) {
      const code = generateOrderNumber().split('-')[1]!
      assert.doesNotMatch(code, /[IO01]/, `ambiguous character in ${code}`)
    }
  })

  test('collides rarely enough to be worth only a retry loop', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i += 1) seen.add(generateOrderNumber())
    assert.equal(seen.size, 2000)
  })
})
