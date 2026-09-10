import { getDb } from '@/db'
import { featureFlags, settings } from '@/db/schema'
import { log } from '@/lib/logger'

/**
 * Feature flags and non-secret settings, read for rendering.
 *
 * Every key exposed in the admin does something in code; a toggle that
 * changes nothing is worse than no toggle. See src/app/admin/(protected)/
 * settings for the list and what each one affects.
 */
export interface Flags {
  stickyCta: boolean
  couponsEnabled: boolean
}

export interface PublicSettings {
  supportEmail: string
  downloadMaxPerOrder: number | null
}

const DEFAULT_FLAGS: Flags = { stickyCta: true, couponsEnabled: false }

export async function getFlags(): Promise<Flags> {
  if (!process.env.DATABASE_URL) return DEFAULT_FLAGS
  try {
    const rows = await getDb().select({ key: featureFlags.key, enabled: featureFlags.enabled }).from(featureFlags)
    const m = new Map(rows.map((r) => [r.key, r.enabled]))
    return {
      stickyCta: m.get('sticky_cta_enabled') ?? DEFAULT_FLAGS.stickyCta,
      couponsEnabled: m.get('coupons_enabled') ?? DEFAULT_FLAGS.couponsEnabled,
    }
  } catch (err) {
    log.warn('flags.unavailable', { err })
    return DEFAULT_FLAGS
  }
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const out: PublicSettings = { supportEmail: '', downloadMaxPerOrder: null }
  if (!process.env.DATABASE_URL) return out
  try {
    const rows = await getDb().select({ key: settings.key, value: settings.value }).from(settings)
    for (const r of rows) {
      if (r.key === 'support_email' && typeof r.value === 'string') out.supportEmail = r.value
      if (r.key === 'download_max_per_order' && typeof r.value === 'number' && r.value > 0) out.downloadMaxPerOrder = Math.floor(r.value)
    }
  } catch (err) {
    log.warn('settings.unavailable', { err })
  }
  return out
}
