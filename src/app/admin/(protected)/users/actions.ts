'use server'

import { and, eq, ne, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { getDb } from '@/db'
import { adminSessions, adminUsers } from '@/db/schema'
import { guard, requestIp, str, withMessage } from '@/lib/admin-guard'
import { isUniqueViolation } from '@/lib/db-errors'
import { hashPassword, validatePasswordStrength } from '@/lib/password'
import type { AdminRole } from '@/lib/session'
import { recordAudit } from '@/services/admin-auth'

const BACK = '/admin/users'
const ROLES: AdminRole[] = ['super_admin', 'admin', 'marketing', 'support']

function roleOf(v: string): AdminRole | null {
  return (ROLES as string[]).includes(v) ? (v as AdminRole) : null
}

/** Refuse to remove the last active super admin. */
async function wouldOrphan(excludeId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(and(ne(adminUsers.id, excludeId), eq(adminUsers.role, 'super_admin'), eq(adminUsers.isActive, true)))
  return (rows[0]?.n ?? 0) === 0
}

export async function createAdminUser(formData: FormData): Promise<void> {
  const admin = await guard('users.manage', BACK)
  const email = str(formData, 'email', 254).toLowerCase()
  const name = str(formData, 'name', 120)
  const role = roleOf(str(formData, 'role', 32))
  const password = String(formData.get('password') ?? '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(withMessage(BACK, 'error', 'সঠিক ইমেইল দিন।') as never)
  if (!role) redirect(withMessage(BACK, 'error', 'ভূমিকা সঠিক নয়।') as never)
  const strength = validatePasswordStrength(password)
  if (!strength.ok) redirect(withMessage(BACK, 'error', strength.reason ?? 'পাসওয়ার্ড দুর্বল।') as never)

  try {
    const rows = await getDb()
      .insert(adminUsers)
      .values({ email, name, role, passwordHash: await hashPassword(password), isActive: true })
      .returning({ id: adminUsers.id })
    await recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'admin.user_created', entityType: 'admin_user', entityId: rows[0]?.id ?? email, after: { email, role }, ip: await requestIp() })
  } catch (err) {
    if (isUniqueViolation(err)) redirect(withMessage(BACK, 'error', 'এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে।') as never)
    throw err
  }
  redirect(withMessage(BACK, 'msg', `${email} তৈরি হয়েছে (${role})। প্রথম প্রবেশের পর পাসওয়ার্ড বদলাতে বলুন।`) as never)
}

export async function setAdminRole(formData: FormData): Promise<void> {
  const admin = await guard('users.manage', BACK)
  const id = str(formData, 'id', 64)
  const role = roleOf(str(formData, 'role', 32))
  if (!role) redirect(withMessage(BACK, 'error', 'ভূমিকা সঠিক নয়।') as never)
  if (id === admin.userId) redirect(withMessage(BACK, 'error', 'নিজের ভূমিকা নিজে বদলানো যায় না।') as never)

  const db = getDb()
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1)
  const target = rows[0]
  if (!target) redirect(withMessage(BACK, 'error', 'ব্যবহারকারী পাওয়া যায়নি।') as never)
  if (target.role === 'super_admin' && role !== 'super_admin' && (await wouldOrphan(id))) {
    redirect(withMessage(BACK, 'error', 'শেষ সুপার অ্যাডমিনকে নামানো যায় না।') as never)
  }

  await db.update(adminUsers).set({ role, updatedAt: new Date() }).where(eq(adminUsers.id, id))
  // A role change takes effect on the next request of any live session,
  // because getCurrentAdmin re-reads the role each time.
  await recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'admin.role_changed', entityType: 'admin_user', entityId: id, before: { role: target.role }, after: { role }, ip: await requestIp() })
  redirect(withMessage(BACK, 'msg', `${target.email} এখন ${role}।`) as never)
}

export async function setAdminActive(formData: FormData): Promise<void> {
  const admin = await guard('users.manage', BACK)
  const id = str(formData, 'id', 64)
  const active = str(formData, 'active', 8) === '1'
  if (id === admin.userId) redirect(withMessage(BACK, 'error', 'নিজের অ্যাকাউন্ট নিজে বন্ধ করা যায় না।') as never)

  const db = getDb()
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1)
  const target = rows[0]
  if (!target) redirect(withMessage(BACK, 'error', 'ব্যবহারকারী পাওয়া যায়নি।') as never)
  if (!active && target.role === 'super_admin' && (await wouldOrphan(id))) {
    redirect(withMessage(BACK, 'error', 'শেষ সক্রিয় সুপার অ্যাডমিন বন্ধ করা যায় না।') as never)
  }

  await db.transaction(async (tx) => {
    await tx.update(adminUsers).set({ isActive: active, updatedAt: new Date() }).where(eq(adminUsers.id, id))
    if (!active) await tx.delete(adminSessions).where(eq(adminSessions.userId, id))
  })
  await recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: active ? 'admin.user_activated' : 'admin.user_deactivated', entityType: 'admin_user', entityId: id, before: { isActive: target.isActive }, after: { isActive: active }, ip: await requestIp() })
  redirect(withMessage(BACK, 'msg', `${target.email} ${active ? 'সক্রিয়' : 'বন্ধ'} করা হয়েছে${active ? '' : '; সব সেশন শেষ'}।`) as never)
}
