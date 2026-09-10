import { sql } from 'drizzle-orm'

import { getDb, type Database } from '@/db'
import { log } from '@/lib/logger'

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * A sliding window would be more precise, but a fixed window is one atomic
 * statement and needs no background cleanup on the hot path, and the goal here
 * is to stop credential stuffing and checkout flooding, not to meter an API to
 * the millisecond.
 *
 * The whole counter update happens inside a single INSERT ... ON CONFLICT so
 * two concurrent requests cannot both read "4 of 5" and both proceed.
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the current window resets. */
  retryAfterSeconds: number
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  dbParam?: Database,
): Promise<RateLimitResult> {
  if (limit <= 0) throw new Error('limit must be positive')

  try {
    // Inside the try on purpose. If the database is unreachable or not yet
    // configured, this limiter fails OPEN (see below); resolving the handle as
    // a default parameter would throw before this block and fail CLOSED.
    const db = dbParam ?? getDb()
    const result = await db.execute(sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limits.window_start < now() - (${windowSeconds} * interval '1 second')
          THEN 1
          ELSE rate_limits.count + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < now() - (${windowSeconds} * interval '1 second')
          THEN now()
          ELSE rate_limits.window_start
        END
      RETURNING count, EXTRACT(EPOCH FROM (window_start + (${windowSeconds} * interval '1 second') - now())) AS reset_in
    `)

    const row = (result.rows as Array<{ count: number | string; reset_in: number | string }>)[0]
    if (!row) return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }

    const count = Number(row.count)
    const resetIn = Math.max(0, Math.ceil(Number(row.reset_in)))

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: resetIn,
    }
  } catch (err) {
    // Fail OPEN.
    //
    // A rate limiter that takes the checkout down when the database hiccups
    // has caused more damage than the abuse it prevents. The abuse ceiling is
    // still enforced by the gateway and by idempotency; revenue is not.
    log.error('rate_limit.failed_open', { key, err })
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 }
  }
}

/**
 * Client IP behind Vercel's proxy.
 *
 * `x-forwarded-for` is attacker-controlled in general, but on Vercel the
 * platform overwrites it, so the LEFT-most entry is the real client. Taking
 * the right-most here would give every request the same proxy address.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
