import { NextResponse } from 'next/server'

import { serverEnv } from '@/config/env'
import { safeEqual } from '@/lib/crypto'
import { withConfigGuard } from '@/lib/http'
import { log } from '@/lib/logger'
import { dispatchPendingTrackingEvents } from '@/services/tracking-dispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Vercel's Hobby plan caps cron invocations at 60s; a batch of 50 finishes
// well inside that. Raise alongside the batch size if that ever changes.
export const maxDuration = 60

/**
 * GET /api/cron/dispatch-tracking
 *
 * Drains the server-side tracking queue. Invoked by Vercel Cron (see
 * vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Authentication is mandatory rather than nice-to-have. An open endpoint here
 * lets anyone flush the queue repeatedly, and while Meta deduplicates by
 * event_id, the request volume alone is a cheap way to burn the rate limit.
 */
export async function GET(request: Request): Promise<Response> {
  return withConfigGuard(() => handle(request))
}

async function handle(request: Request): Promise<Response> {
  const expected = serverEnv().CRON_SECRET

  if (!expected) {
    log.error('cron.not_configured', { job: 'dispatch-tracking' })
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 })
  }

  const presented = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!safeEqual(presented, expected)) {
    log.warn('cron.unauthorized', { job: 'dispatch-tracking' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await dispatchPendingTrackingEvents(50)
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    log.error('cron.dispatch_tracking_failed', { err })
    return NextResponse.json({ ok: false, error: 'Dispatch failed' }, { status: 500 })
  }
}
