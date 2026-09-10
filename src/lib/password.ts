import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * Admin password hashing.
 *
 * scrypt from node:crypto rather than bcrypt or argon2, for one practical
 * reason: those are native modules that need a compiler or a prebuilt binary
 * for every deployment target, and this project must install cleanly on a
 * Windows dev machine and on Vercel's Linux builders without a toolchain.
 * scrypt is memory-hard, is in the standard library, and is FIPS-adjacent
 * enough for an admin login on a single-product funnel.
 *
 * Parameters: N=2^15, r=8, p=1 costs roughly 32 MB and ~100 ms per hash. That
 * is slow enough to make offline cracking expensive and fast enough that a
 * legitimate login does not feel broken.
 */
const PARAMS = { N: 32768, r: 8, p: 1 } as const
const KEYLEN = 64
const SALT_BYTES = 16
// scrypt needs roughly 128 * N * r bytes; the default 32 MB cap is exactly on
// the line for these parameters, so ask for headroom or Node throws.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string')
  }
  const salt = randomBytes(SALT_BYTES)
  const derived = await scrypt(password, salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM })
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash, so a corrupted row
 * denies access instead of returning a 500 that tells an attacker the account
 * exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6) return false
    const [scheme, nStr, rStr, pStr, saltB64, hashB64] = parts as [
      string, string, string, string, string, string,
    ]
    if (scheme !== 'scrypt') return false

    const N = Number(nStr)
    const r = Number(rStr)
    const p = Number(pStr)
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
    // Refuse absurd parameters from a tampered row rather than allocating 8 GB.
    if (N > 1 << 20 || r > 32 || p > 16) return false

    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    if (expected.length === 0) return false

    const derived = await scrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    })
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * Password policy for admin accounts.
 *
 * Length is the only requirement that meaningfully raises cost. Composition
 * rules ("must contain a symbol") mostly produce `Password1!` and are omitted
 * deliberately.
 */
export function validatePasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (password.length < 12) {
    return { ok: false, reason: 'পাসওয়ার্ড অন্তত ১২ অক্ষরের হতে হবে' }
  }
  if (password.length > 256) {
    return { ok: false, reason: 'পাসওয়ার্ড অত্যধিক দীর্ঘ' }
  }
  const common = ['password', '12345678', 'qwertyui', 'admin123', 'letmein1']
  const lower = password.toLowerCase()
  if (common.some((c) => lower.includes(c))) {
    return { ok: false, reason: 'পাসওয়ার্ডটি অনুমান করা খুব সহজ' }
  }
  return { ok: true }
}
