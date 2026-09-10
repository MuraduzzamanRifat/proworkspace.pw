import { z } from 'zod'

/**
 * Fail-fast environment validation.
 *
 * Rationale: a funnel that boots with a missing payment key and only discovers
 * it when a real customer clicks Buy has converted a config error into lost
 * revenue. Everything required to take money is validated at module load.
 *
 * Split into two schemas because Next.js inlines NEXT_PUBLIC_* at build time
 * and strips everything else from the client bundle. Importing `serverEnv`
 * from a client component is a build error, which is the point.
 */

const isProd = process.env.NODE_ENV === 'production'

/** Non-empty in production, optional in dev so `npm run dev` works unconfigured. */
const requiredInProd = (name: string) =>
  z
    .string()
    .default('')
    .superRefine((val, ctx) => {
      if (isProd && val.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be set in production`,
        })
      }
    })

/** A secret with real entropy. 32 hex chars is the floor we accept. */
const secret = (name: string) =>
  z
    .string()
    .default('')
    .superRefine((val, ctx) => {
      if (!isProd) return
      if (val.trim().length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be at least 32 characters in production`,
        })
      }
    })

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: requiredInProd('DATABASE_URL'),

  SESSION_SECRET: secret('SESSION_SECRET'),
  DOWNLOAD_SECRET: secret('DOWNLOAD_SECRET'),

  UDDOKTAPAY_BASE_URL: z
    .string()
    .url()
    .default('https://sandbox.uddoktapay.com')
    .transform((u) => u.replace(/\/+$/, '')),
  // Deliberately NOT required at boot. `paymentsConfigured()` gates every
  // money path: the checkout page hides its form, the checkout API answers
  // "gateway unavailable", and the webhook refuses, all without this key.
  // Making it a hard requirement would also lock the owner out of the admin
  // before the gateway is wired, which is exactly when the admin is needed.
  UDDOKTAPAY_API_KEY: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().default('Corieosity <noreply@example.com>'),
  ADMIN_ALERT_EMAIL: z.string().default(''),

  EBOOK_FILE_URL: z.string().default(''),

  META_CAPI_ACCESS_TOKEN: z.string().default(''),
  META_CAPI_TEST_EVENT_CODE: z.string().default(''),

  // Shared secret for scheduled jobs. Vercel Cron sends it as a Bearer token.
  // Without it the cron endpoint refuses every request, including Vercel's,
  // which is preferable to an open endpoint that drains the tracking queue.
  CRON_SECRET: secret('CRON_SECRET'),
})

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .default('http://localhost:3000')
    .transform((u) => u.replace(/\/+$/, '')),
  NEXT_PUBLIC_META_PIXEL_ID: z.string().default(''),
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: z.string().default(''),
})

/**
 * Thrown when the environment fails validation.
 *
 * A distinct class so that request handlers can tell "this deployment is
 * not configured" apart from every other failure and answer with a 503 and a
 * logged reason, instead of an opaque function crash. On a serverless
 * platform there is no boot to fail fast at; each invocation is the boot.
 */
export class ConfigError extends Error {
  readonly missing: readonly string[]
  constructor(message: string, missing: readonly string[]) {
    super(message)
    this.name = 'ConfigError'
    this.missing = missing
  }
}

export function isConfigError(err: unknown): err is ConfigError {
  return err instanceof ConfigError || (err instanceof Error && err.name === 'ConfigError')
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, raw: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    const missing = result.error.issues.map((i) => i.path.join('.') || '(root)')
    // Never print the values, only the names that failed.
    throw new ConfigError(`Invalid ${label} environment:\n${detail}`, missing)
  }
  return result.data
}

/**
 * Client-safe. Only NEXT_PUBLIC_* values, which are already in the browser
 * bundle. Safe to import anywhere.
 *
 * These must be referenced as literal `process.env.NEXT_PUBLIC_X` property
 * accesses so the Next.js compiler can statically replace them.
 */
export const clientEnv = parseOrThrow(
  clientSchema,
  {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
    NEXT_PUBLIC_GA4_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  },
  'client',
)

let _serverEnv: z.infer<typeof serverSchema> | null = null

/**
 * Server-only. Throws if imported into a client component bundle.
 * Lazy so that importing a module for its types does not trip validation
 * inside tooling that runs without a full environment.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. This is a secret leak.')
  }
  if (_serverEnv === null) {
    _serverEnv = parseOrThrow(serverSchema, process.env, 'server')
  }
  return _serverEnv
}

/** True when the gateway is configured well enough to attempt a real charge. */
export function paymentsConfigured(): boolean {
  const e = serverEnv()
  return e.UDDOKTAPAY_API_KEY.trim() !== '' && e.UDDOKTAPAY_BASE_URL.trim() !== ''
}

/** True when transactional email can actually be delivered. */
export function emailConfigured(): boolean {
  return serverEnv().RESEND_API_KEY.trim() !== ''
}

export const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL
