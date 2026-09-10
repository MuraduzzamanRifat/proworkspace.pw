'use client'

/**
 * Marketing attribution capture.
 *
 * First-touch is written once and never overwritten: the campaign that first
 * brought someone to the site keeps the credit even if they return later via a
 * direct visit or a retargeting click. Last-touch is refreshed on every visit
 * that carries campaign parameters.
 *
 * Everything lives in localStorage, is read only at checkout, and is attached
 * to the order. Nothing here is sent to a third party.
 */

const FIRST_TOUCH_KEY = 'crs_first_touch'
const LAST_TOUCH_KEY = 'crs_last_touch'

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

/** Ad-platform click identifiers. */
const CLICK_ID_KEYS = ['fbclid', 'gclid', 'ttclid', 'msclkid'] as const

type Touch = Record<string, string>

function readCurrentTouch(): Touch {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const touch: Touch = {}

  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value) touch[key] = value.slice(0, 256)
  }
  for (const key of CLICK_ID_KEYS) {
    const value = params.get(key)
    if (value) touch[key] = value.slice(0, 256)
  }

  if (document.referrer && !document.referrer.includes(window.location.host)) {
    touch['referrer'] = document.referrer.slice(0, 256)
  }
  touch['landing_page'] = window.location.pathname.slice(0, 256)
  touch['ts'] = new Date().toISOString()

  return touch
}

function safeRead(key: string): Touch | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Touch) : null
  } catch {
    // Private mode, blocked storage, corrupt value. Attribution is a
    // nice-to-have; it must never break a checkout.
    return null
  }
}

function safeWrite(key: string, value: Touch): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

/** Call once on page load. Safe to call repeatedly. */
export function recordTouch(): void {
  if (typeof window === 'undefined') return
  const current = readCurrentTouch()
  const hasCampaign = Object.keys(current).some(
    (k) => k !== 'ts' && k !== 'landing_page' && k !== 'referrer',
  )

  if (!safeRead(FIRST_TOUCH_KEY)) {
    safeWrite(FIRST_TOUCH_KEY, current)
  }
  if (hasCampaign || !safeRead(LAST_TOUCH_KEY)) {
    safeWrite(LAST_TOUCH_KEY, current)
  }
}

/** Flattened first/last touch, ready to attach to an order. */
export function collectAttribution(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  recordTouch()

  const first = safeRead(FIRST_TOUCH_KEY) ?? {}
  const last = safeRead(LAST_TOUCH_KEY) ?? {}
  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(first)) out[`first_${k}`] = String(v).slice(0, 256)
  for (const [k, v] of Object.entries(last)) out[`last_${k}`] = String(v).slice(0, 256)

  // The server caps this at 20 keys; trim here too so the request stays small.
  return Object.fromEntries(Object.entries(out).slice(0, 20))
}

/**
 * Stable per-attempt key so a double submit cannot create two orders.
 *
 * `crypto.randomUUID` is unavailable in insecure contexts (plain http on a LAN
 * IP, which is exactly how a phone gets tested against a dev server), so both
 * fallbacks are real code paths rather than defensive decoration.
 */
export function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID()
  } catch {
    /* not a secure context */
  }

  const bytes = new Uint8Array(16)
  try {
    crypto.getRandomValues(bytes)
  } catch {
    // Math.random is not cryptographically strong, and does not need to be:
    // this value is a deduplication key, not a secret. Uniqueness is enough.
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
