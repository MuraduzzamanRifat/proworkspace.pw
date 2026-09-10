import { and, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { serverEnv } from '@/config/env'
import { getDb, type Database } from '@/db'
import { adminSessions, adminUsers } from '@/db/schema'
import { randomId, sha256Hex, verifyToken, signToken } from '@/lib/crypto'
import { log } from '@/lib/logger'

/**
 * Admin sessions.
 *
 * The cookie carries a signed token; the database stores only the SHA-256 of
 * it. A dump of `admin_sessions` therefore hands an attacker nothing usable,
 * which is the same reason passwords are hashed.
 *
 * Sessions are server-side records rather than self-contained JWTs so that
 * "log out everywhere" and "revoke this session" are one DELETE, not a
 * blocklist bolted onto a stateless design.
 */

export const SESSION_COOKIE = 'crs_admin_session'
const SESSION_TTL_HOURS = 12

export type AdminRole = 'super_admin' | 'admin' | 'marketing' | 'support'

export interface AdminIdentity {
  userId: string
  email: string
  name: string
  role: AdminRole
  sessionId: string
}

export async function createSession(
  userId: string,
  meta: { ip: string; userAgent: string },
  db: Database = getDb(),
): Promise<string> {
  const raw = randomId(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000)

  const inserted = await db
    .insert(adminSessions)
    .values({
      tokenHash: sha256Hex(raw),
      userId,
      expiresAt,
      ipAddress: meta.ip,
      userAgent: meta.userAgent.slice(0, 512),
    })
    .returning({ id: adminSessions.id })

  const sessionId = inserted[0]?.id
  if (!sessionId) throw new Error('Session insert returned no row')

  const token = signToken(
    { sub: raw, exp: Math.floor(expiresAt.getTime() / 1000), kind: 'sess' },
    serverEnv().SESSION_SECRET,
  )

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  return sessionId
}

/** Current admin, or null. Never throws. */
export async function getCurrentAdmin(db: Database = getDb()): Promise<AdminIdentity | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null

    let raw: string
    try {
      const payload = verifyToken(token, serverEnv().SESSION_SECRET)
      if (payload['kind'] !== 'sess') return null
      raw = payload.sub
    } catch {
      return null
    }

    const rows = await db
      .select({
        sessionId: adminSessions.id,
        userId: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        isActive: adminUsers.isActive,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
      .where(
        and(
          eq(adminSessions.tokenHash, sha256Hex(raw)),
          gt(adminSessions.expiresAt, new Date()),
        ),
      )
      .limit(1)

    const row = rows[0]
    // A deactivated account loses access immediately, without waiting for the
    // session to expire.
    if (!row || !row.isActive) return null

    return {
      userId: row.userId,
      email: row.email,
      name: row.name,
      role: row.role,
      sessionId: row.sessionId,
    }
  } catch (err) {
    log.error('session.lookup_failed', { err })
    return null
  }
}

export async function destroySession(db: Database = getDb()): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  if (token) {
    try {
      const payload = verifyToken(token, serverEnv().SESSION_SECRET)
      await db.delete(adminSessions).where(eq(adminSessions.tokenHash, sha256Hex(payload.sub)))
    } catch {
      /* an unreadable cookie is already useless; just clear it */
    }
  }

  store.delete(SESSION_COOKIE)
}

/**
 * Role gate.
 *
 * Authorisation is checked on the server for every action. Hiding a button in
 * the UI is presentation, not access control.
 */
const ROLE_RANK: Record<AdminRole, number> = {
  support: 1,
  marketing: 2,
  admin: 3,
  super_admin: 4,
}

export function hasAtLeast(role: AdminRole, required: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required]
}
