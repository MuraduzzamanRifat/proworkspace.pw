import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { ConfigError, isConfigError } from '../src/config/env'
import { withConfigGuard } from '../src/lib/http'

/**
 * Pins the contract that turned an unconfigured deployment from a blank
 * function crash into a 503 with a reason. If someone later "simplifies"
 * ConfigError back into a plain Error, this is what fails.
 */

describe('ConfigError', () => {
  test('carries the names of what is missing, and only the names', () => {
    const err = new ConfigError('Invalid server environment', ['DATABASE_URL', 'CRON_SECRET'])
    assert.deepEqual(err.missing, ['DATABASE_URL', 'CRON_SECRET'])
    assert.equal(err.name, 'ConfigError')
    // The message must never contain a value; it lists names.
    assert.doesNotMatch(err.message, /postgres:\/\//)
  })

  test('isConfigError recognises the class', () => {
    assert.equal(isConfigError(new ConfigError('x', [])), true)
  })

  test('isConfigError recognises a duplicate class instance by name', () => {
    // Bundlers can produce two copies of a module; instanceof then fails
    // across the boundary. The name check is the fallback.
    const foreign = new Error('x')
    foreign.name = 'ConfigError'
    assert.equal(isConfigError(foreign), true)
  })

  test('isConfigError rejects everything else', () => {
    assert.equal(isConfigError(new Error('boom')), false)
    assert.equal(isConfigError('ConfigError'), false)
    assert.equal(isConfigError(null), false)
  })
})

describe('withConfigGuard', () => {
  test('maps a ConfigError to a 503 that names the missing variables', async () => {
    const res = await withConfigGuard(async () => {
      throw new ConfigError('Invalid server environment', ['DATABASE_URL'])
    })
    assert.equal(res.status, 503)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const body = (await res.json()) as { ok: boolean; error: string; missing: string[] }
    assert.equal(body.ok, false)
    assert.deepEqual(body.missing, ['DATABASE_URL'])
  })

  test('passes a successful response straight through', async () => {
    const res = await withConfigGuard(async () => new Response('fine', { status: 200 }))
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'fine')
  })

  test('rethrows anything that is not a configuration failure', async () => {
    await assert.rejects(
      () =>
        withConfigGuard(async () => {
          throw new Error('database on fire')
        }),
      /database on fire/,
    )
  })
})
