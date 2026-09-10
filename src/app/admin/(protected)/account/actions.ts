'use server'

import { and, eq, ne } from 'drizzle-orm'
import { headers } from 'next/headers'

import { getDb } from '@/db'
import { adminSessions, adminUsers } from '@/db/schema'
import { log } from '@/lib/logger'
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/password'
import { clientIp } from '@/lib/rate-limit'
import { getCurrentAdmin } from '@/lib/session'
import { recordAudit } from '@/services/admin-auth'

export interface PasswordFormState {
  ok?: string
  error?: string
}

/**
 * Change the signed-in admin's own password.
 *
 * Requires the current password even though the user is already signed in.
 * A session cookie proves someone had the browser; the current password
 * proves it is the account owner and not whoever sat down at the machine.
 *
 * On success every OTHER session for this user is revoked. Changing a
 * password because you suspect it leaked is pointless if the leaked session
 * keeps working.
 */
export async function changePasswordAction(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const admin = await getCurrentAdmin()
  if (!admin) return { error: 'সেশনের মেয়াদ শেষ। আবার প্রবেশ করুন।' }

  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('next') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (current === '' || next === '' || confirm === '') {
    return { error: 'তিনটি ঘরই পূরণ করুন।' }
  }
  if (next !== confirm) {
    return { error: 'নতুন পাসওয়ার্ড দুবার একই হয়নি।' }
  }
  if (next === current) {
    return { error: 'নতুন পাসওয়ার্ড বর্তমানটির মতোই।' }
  }
  const strength = validatePasswordStrength(next)
  if (!strength.ok) {
    return { error: strength.reason ?? 'পাসওয়ার্ডটি যথেষ্ট শক্ত নয়।' }
  }

  const db = getDb()
  const rows = await db
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.userId))
    .limit(1)

  const row = rows[0]
  if (!row) return { error: 'অ্যাকাউন্টটি পাওয়া যায়নি।' }

  const valid = await verifyPassword(current, row.passwordHash)
  if (!valid) {
    log.warn('admin.password_change_rejected', { userId: admin.userId })
    return { error: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' }
  }

  const newHash = await hashPassword(next)

  await db.transaction(async (tx) => {
    await tx
      .update(adminUsers)
      .set({ passwordHash: newHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.userId))

    // Keep only the session that made this change.
    await tx
      .delete(adminSessions)
      .where(and(eq(adminSessions.userId, admin.userId), ne(adminSessions.id, admin.sessionId)))
  })

  const headerList = await headers()
  await recordAudit({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'admin.password_changed',
    entityType: 'admin_user',
    entityId: admin.userId,
    ip: clientIp(headerList),
  })

  log.info('admin.password_changed', { userId: admin.userId })
  return { ok: 'পাসওয়ার্ড বদলানো হয়েছে। অন্য সব ডিভাইস থেকে লগআউট করা হয়েছে।' }
}
