'use server'

import { redirect } from 'next/navigation'

import { destroySession, getCurrentAdmin } from '@/lib/session'
import { recordAudit } from '@/services/admin-auth'

export async function logoutAction(): Promise<void> {
  const admin = await getCurrentAdmin()
  if (admin) {
    await recordAudit({
      actorId: admin.userId,
      actorEmail: admin.email,
      action: 'admin.logout',
      entityType: 'admin_user',
      entityId: admin.userId,
    })
  }
  await destroySession()
  redirect('/admin/login')
}
