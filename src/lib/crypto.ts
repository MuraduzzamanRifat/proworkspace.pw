import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Cryptographic helpers built only on node:crypto.
 *
 * No external dependency signs anything here. Every comparison of a secret
 * uses `timingSafeEqual`, because `a === b` on a token leaks its contents one
 * byte at a time to anyone patient enough to measure.
 */

/** URL-safe base64 without padding. */
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64')
}

/** Cryptographically random, URL-safe identifier. */
export function randomId(bytes = 24): string {
  return b64url(randomBytes(bytes))
}

/** SHA-256 hex digest. Used to store session tokens without storing the token. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * Constant-time string comparison.
 *
 * Returns false for length mismatches without leaking which position differed.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing does not distinguish
    // "wrong length" from "wrong content".
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

// ---------------------------------------------------------------------------
// Signed, expiring tokens
// ---------------------------------------------------------------------------

export interface SignedTokenPayload {
  /** Subject: what this token grants access to. */
  sub: string
  /** Unix seconds. */
  exp: number
  /** Optional extra claims. Keep small; this rides in a URL. */
  [key: string]: string | number
}

export class TokenError extends Error {
  readonly reason: 'malformed' | 'bad_signature' | 'expired'
  constructor(reason: 'malformed' | 'bad_signature' | 'expired') {
    super(`Token rejected: ${reason}`)
    this.name = 'TokenError'
    this.reason = reason
  }
}

/**
 * Sign a payload as `<base64url(json)>.<base64url(hmac)>`.
 *
 * This is not a JWT and deliberately so: no algorithm field means no
 * `alg: none` downgrade, and no library means no library CVE.
 */
export function signToken(payload: SignedTokenPayload, secret: string): string {
  if (!secret) throw new Error('Cannot sign a token with an empty secret')
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64url(createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

/** Verify and decode. Throws TokenError on any failure. */
export function verifyToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): SignedTokenPayload {
  if (!secret) throw new Error('Cannot verify a token with an empty secret')

  const parts = token.split('.')
  if (parts.length !== 2) throw new TokenError('malformed')

  const [body, sig] = parts as [string, string]
  const expected = b64url(createHmac('sha256', secret).update(body).digest())
  if (!safeEqual(sig, expected)) throw new TokenError('bad_signature')

  let payload: SignedTokenPayload
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8')) as SignedTokenPayload
  } catch {
    throw new TokenError('malformed')
  }

  if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string') {
    throw new TokenError('malformed')
  }
  if (payload.exp * 1000 <= now.getTime()) throw new TokenError('expired')

  return payload
}

// ---------------------------------------------------------------------------
// Human-facing identifiers
// ---------------------------------------------------------------------------

/**
 * Order number, e.g. `PW-9F3K2QD7`.
 *
 * Excludes I, O, 0 and 1 so a customer reading one over the phone to support
 * cannot produce an ambiguous transcription. 8 characters from a 32-symbol
 * alphabet is 40 bits, and the column is UNIQUE, so a collision is a retry
 * rather than a corrupted order.
 */
const UNAMBIGUOUS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function generateOrderNumber(prefix = 'PW'): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i += 1) {
    out += UNAMBIGUOUS[bytes[i]! % UNAMBIGUOUS.length]
  }
  return `${prefix}-${out}`
}
