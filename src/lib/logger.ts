/**
 * Structured logging.
 *
 * One rule above all: never log a secret and never log a full email address.
 * Support needs enough to find an order; an aggregated log store is not a
 * place to accumulate a customer list.
 *
 * Output is single-line JSON so Vercel's log drain can index it.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Keys whose values are replaced wholesale, wherever they appear. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'token',
  'secret',
  'session_secret',
  'download_secret',
  'rt-uddoktapay-api-key',
  'uddoktapay_api_key',
  'resend_api_key',
  'meta_capi_access_token',
  'database_url',
])

/** `mj@example.com` becomes `mj***@example.com`. */
export function maskEmail(email: string): string {
  const trimmed = (email ?? '').trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return trimmed === '' ? '' : '***'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at)
  const head = local.slice(0, Math.min(2, local.length))
  return `${head}***${domain}`
}

/** `01712345678` becomes `017*****678`. */
export function maskPhone(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 6) return digits === '' ? '' : '***'
  return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 6)}${digits.slice(-3)}`
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (value instanceof Error) {
    return { name: value.name, message: value.message }
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]'
      } else if (k.toLowerCase() === 'email' && typeof v === 'string') {
        out[k] = maskEmail(v)
      } else if (k.toLowerCase() === 'phone' && typeof v === 'string') {
        out[k] = maskPhone(v)
      } else {
        out[k] = redact(v, depth + 1)
      }
    }
    return out
  }
  return String(value)
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const line = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(data ? (redact(data) as Record<string, unknown>) : {}),
  }
  const serialised = JSON.stringify(line)
  if (level === 'error') console.error(serialised)
  else if (level === 'warn') console.warn(serialised)
  else console.log(serialised)
}

export const log = {
  debug: (event: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', event, data)
  },
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
}
