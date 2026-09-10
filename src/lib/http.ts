import { NextResponse } from 'next/server'

import { isConfigError } from '@/config/env'
import { log } from '@/lib/logger'

/**
 * Route-handler guard for configuration failures.
 *
 * `serverEnv()` throws a ConfigError when a required variable is absent.
 * Left unhandled, that surfaces as a bare 500 with no body and a stack trace
 * in the logs that names the variable but nothing else. This turns it into:
 *
 *   - a 503, which is the honest status ("not available", not "broken"), and
 *     one that monitoring can distinguish from a real crash;
 *   - a stable JSON body a client can show;
 *   - a structured log line listing the missing variable NAMES, never values.
 *
 * Everything that is not a ConfigError is rethrown untouched.
 */
export async function withConfigGuard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    if (isConfigError(err)) {
      log.error('config.invalid', { missing: err.missing })
      return NextResponse.json(
        { ok: false, error: 'Service not configured', missing: err.missing },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    throw err
  }
}
