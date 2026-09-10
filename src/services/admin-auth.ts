import { eq, sql } from 'drizzle-orm'

import { getDb, type Database } from '@/db'
import { adminUsers, auditLogs } from '@/db/schema'
import { log } from '@/lib/logger'
import { verifyPassword } from '@/lib/password'
import { consumeRateLimit } from '@/lib/rate-limit'
import { createSession } from '@/lib/session'

/**
 * Admin login.
 *
 * Three independent brakes on brute force, because any one alone is weak:
 *
 *   - per-IP rate limit, which stops a single host hammering many accounts
 *   - per-account failure counter with a lockout, which stops a botnet
 *     spreading attempts across many IPs against one account
 *   - a slow password hash (scrypt), which makes each guess cost real CPU
 *
 * The response is deliberately identical for "no such user" and "wrong
 * password". Distinguishing them turns the login form into an account
 * enumeration oracle.
 */

const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MINUTES = 15

export interface LoginResult {
  ok: boolean
  /** Shown to the user. Never says which half was wrong. */
  error?: string
}

export async function login(
  args: { email: string; password: string; ip: string; userAgent: string },
  dbParam?: Database,
): Promise<LoginResult> {
  const db = dbParam ?? getDb()
  const email = args.email.trim().toLowerCase()
  const genericError = 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।'

  // 10 attempts per IP per 15 minutes.
  const ipLimit = await consumeRateLimit(`admin-login:${args.ip}`, 10, 900, db)
  if (!ipLimit.allowed) {
    log.warn('admin.login_rate_limited', { ip: args.ip })
    return { ok: false, error: 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।' }
  }

  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      passwordHash: adminUsers.passwordHash,
      isActive: adminUsers.isActive,
      failedAttempts: adminUsers.failedAttempts,
      lockedUntil: adminUsers.lockedUntil,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1)

  const user = rows[0]

  if (!user) {
    // Burn comparable time so a missing account is not detectably faster than
    // a wrong password.
    await verifyPassword(args.password, 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA')
    log.warn('admin.login_unknown_user', { ip: args.ip })
    return { ok: false, error: genericError }
  }

  if (!user.isActive) {
    log.warn('admin.login_inactive', { userId: user.id })
    return { ok: false, error: genericError }
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
    log.warn('admin.login_locked', { userId: user.id })
    return { ok: false, error: `অ্যাকাউন্টটি সাময়িকভাবে বন্ধ। ${minutes} মিনিট পরে চেষ্টা করুন।` }
  }

  const valid = await verifyPassword(args.password, user.passwordHash)

  if (!valid) {
    const nextCount = user.failedAttempts + 1
    const shouldLock = nextCount >= MAX_FAILED_ATTEMPTS

    await db
      .update(adminUsers)
      .set({
        failedAttempts: nextCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, user.id))

    await db.insert(auditLogs).values({
      actorId: user.id,
      actorEmail: user.email,
      action: shouldLock ? 'admin.login_locked' : 'admin.login_failed',
      entityType: 'admin_user',
      entityId: user.id,
      ipAddress: args.ip,
    })

    log.warn('admin.login_failed', { userId: user.id, attempt: nextCount, locked: shouldLock })
    return { ok: false, error: genericError }
  }

  // Success: clear the counters and open a session.
  await db
    .update(adminUsers)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, user.id))

  await createSession(user.id, { ip: args.ip, userAgent: args.userAgent }, db)

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorEmail: user.email,
    action: 'admin.login',
    entityType: 'admin_user',
    entityId: user.id,
    ipAddress: args.ip,
  })

  log.info('admin.login_success', { userId: user.id })
  return { ok: true }
}

/** Append-only record of anything consequential an admin does. */
export async function recordAudit(
  args: {
    actorId: string | null
    actorEmail: string
    action: string
    entityType: string
    entityId: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    ip?: string
  },
  dbParam?: Database,
): Promise<void> {
  try {
    const db = dbParam ?? getDb()
    await db.insert(auditLogs).values({
      actorId: args.actorId,
      actorEmail: args.actorEmail,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before ?? null,
      after: args.after ?? null,
      ipAddress: args.ip ?? '',
    })
  } catch (err) {
    // An audit write must never take down the action it is recording, but a
    // silent failure would be worse, so it is logged loudly.
    log.error('audit.write_failed', { action: args.action, err })
  }
}

/** Count of currently locked admin accounts, for the dashboard. */
export async function lockedAccountCount(dbParam?: Database): Promise<number> {
  const db = dbParam ?? getDb()
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(sql`${adminUsers.lockedUntil} > now()`)
  return rows[0]?.n ?? 0
}
