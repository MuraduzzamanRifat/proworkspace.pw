import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { can, type Capability } from '@/lib/permissions'
import { clientIp } from '@/lib/rate-limit'
import { getCurrentAdmin, type AdminIdentity } from '@/lib/session'

/**
 * Guard for form-posting server actions and admin pages.
 *
 * Re-reads the session and checks a capability. On failure it redirects
 * (to login, or back with an error) rather than returning, so callers can
 * treat the return value as an authenticated, authorised admin.
 */
export async function guard(cap: Capability, backTo: string): Promise<AdminIdentity> {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')
  if (!can(admin.role, cap)) redirect(`${backTo}?error=${encodeURIComponent('এই কাজের অনুমতি আপনার নেই।')}` as never)
  return admin
}

export async function requestIp(): Promise<string> {
  try {
    return clientIp(await headers())
  } catch {
    return ''
  }
}

/** Build a redirect target carrying a one-line flash message. */
export function withMessage(path: string, kind: 'msg' | 'error', text: string): string {
  return `${path}?${kind}=${encodeURIComponent(text)}`
}

export function str(fd: FormData, name: string, max = 500): string {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name)
  return v === 'on' || v === 'true' || v === '1'
}

/** Taka from a form field, as integer poisha, or null when not a valid non-negative number. */
export function takaField(fd: FormData, name: string): number | null {
  const raw = str(fd, name, 32)
  if (raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  const poisha = Math.round(n * 100)
  return Math.abs(n * 100 - poisha) > 1e-6 ? null : poisha
}
