import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { hashPassword, validatePasswordStrength, verifyPassword } from '../src/lib/password'

/**
 * scrypt is intentionally slow, so this suite stays deliberately small.
 * Each hash costs roughly 100 ms; that cost is the security property.
 */
describe('password hashing', () => {
  test('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    assert.equal(await verifyPassword('correct horse battery staple', hash), true)
  })

  test('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    assert.equal(await verifyPassword('Correct horse battery staple', hash), false)
  })

  test('produces a different hash each time, so the salt is doing its job', async () => {
    const a = await hashPassword('same password')
    const b = await hashPassword('same password')
    assert.notEqual(a, b)
    assert.equal(await verifyPassword('same password', a), true)
    assert.equal(await verifyPassword('same password', b), true)
  })

  test('records its parameters in the hash string', async () => {
    const hash = await hashPassword('whatever it is')
    const parts = hash.split('$')
    assert.equal(parts.length, 6)
    assert.equal(parts[0], 'scrypt')
    assert.equal(parts[1], '32768')
  })

  test('returns false rather than throwing on a corrupt stored hash', async () => {
    for (const bad of ['', 'garbage', 'scrypt$1$2$3', 'bcrypt$32768$8$1$c2FsdA==$aGFzaA==']) {
      assert.equal(await verifyPassword('any', bad), false, `threw or accepted: ${bad}`)
    }
  })

  test('refuses absurd parameters from a tampered row instead of allocating gigabytes', async () => {
    const tampered = `scrypt$99999999$99$99$c2FsdA==$aGFzaA==`
    assert.equal(await verifyPassword('any', tampered), false)
  })

  test('refuses to hash an empty password', async () => {
    await assert.rejects(() => hashPassword(''))
  })
})

describe('password policy', () => {
  test('requires real length', () => {
    assert.equal(validatePasswordStrength('short').ok, false)
    assert.equal(validatePasswordStrength('elevenchars').ok, false)
    assert.equal(validatePasswordStrength('twelvecharss').ok, true)
  })

  test('rejects obviously guessable passwords', () => {
    assert.equal(validatePasswordStrength('password1234').ok, false)
    assert.equal(validatePasswordStrength('myadmin123456').ok, false)
  })

  test('rejects an absurdly long password rather than hashing it', () => {
    assert.equal(validatePasswordStrength('x'.repeat(300)).ok, false)
  })

  test('accepts a long passphrase', () => {
    assert.equal(validatePasswordStrength('আমার নিজের একটি লম্বা পাসফ্রেজ').ok, true)
  })
})
