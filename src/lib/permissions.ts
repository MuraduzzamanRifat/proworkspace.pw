import type { AdminRole } from '@/lib/session'

/**
 * Capability matrix.
 *
 * Roles are coarse; capabilities are what code checks. Every server action
 * and every admin page asks `can(role, capability)`, never "is this the
 * admin role", so a role's powers can change in one place.
 *
 * Deliberate lines:
 *   - Marketing edits and publishes content and manages media, and can look
 *     at orders and customers, but cannot touch prices, coupons, settings or
 *     accounts. A content editor's compromised password must not be a
 *     price-change or role-change.
 *   - Support sees orders and customers and can resend deliveries, nothing
 *     else.
 *   - Only super admins manage accounts and roles.
 */
export type Capability =
  | 'content.edit'
  | 'content.publish'
  | 'media.manage'
  | 'commerce.manage'
  | 'orders.view'
  | 'orders.manage'
  | 'customers.view'
  | 'settings.manage'
  | 'audit.view'
  | 'users.manage'

const ALL: Capability[] = [
  'content.edit',
  'content.publish',
  'media.manage',
  'commerce.manage',
  'orders.view',
  'orders.manage',
  'customers.view',
  'settings.manage',
  'audit.view',
  'users.manage',
]

const MATRIX: Record<AdminRole, readonly Capability[]> = {
  super_admin: ALL,
  admin: ALL.filter((c) => c !== 'users.manage'),
  marketing: ['content.edit', 'content.publish', 'media.manage', 'orders.view', 'customers.view'],
  support: ['orders.view', 'orders.manage', 'customers.view'],
}

export function can(role: AdminRole, capability: Capability): boolean {
  return MATRIX[role].includes(capability)
}

export function capabilitiesOf(role: AdminRole): readonly Capability[] {
  return MATRIX[role]
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'content.edit': 'ল্যান্ডিং পেজ সম্পাদনা',
  'content.publish': 'ল্যান্ডিং পেজ প্রকাশ',
  'media.manage': 'মিডিয়া লাইব্রেরি',
  'commerce.manage': 'পণ্য, অফার ও কুপন',
  'orders.view': 'অর্ডার দেখা',
  'orders.manage': 'অর্ডারে ব্যবস্থা (রিসেন্ড, ফেরত)',
  'customers.view': 'ক্রেতা দেখা',
  'settings.manage': 'সেটিংস',
  'audit.view': 'কার্যবিবরণী দেখা',
  'users.manage': 'ব্যবহারকারী ও অনুমতি',
}
