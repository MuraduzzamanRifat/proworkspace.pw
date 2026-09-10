import { eq, sql } from 'drizzle-orm'

import { clientEnv, serverEnv } from '@/config/env'
import { getDb, type Database } from '@/db'
import { trackingEvents } from '@/db/schema'
import { sha256Hex } from '@/lib/crypto'
import { log } from '@/lib/logger'

/**
 * Server-side tracking dispatcher (Meta Conversions API).
 *
 * `settlePayment` queues a row in `tracking_events` inside the same
 * transaction that marks an order paid. Nothing is sent from the request path:
 * a slow or failing Meta endpoint must never delay a customer's confirmation.
 * This drains the queue out of band, on a schedule.
 *
 * Deduplication: each row's `event_id` is `purchase-<orderId>`, and the
 * browser pixel on the thank-you page fires with the identical `eventID`.
 * Meta collapses the pair into one conversion. Without that, every sale is
 * counted twice and every reported cost-per-purchase is half the truth.
 */

const GRAPH_VERSION = 'v21.0'
const MAX_ATTEMPTS = 5
const REQUEST_TIMEOUT_MS = 10_000

export interface DispatchSummary {
  claimed: number
  sent: number
  failed: number
  abandoned: number
  skipped: 'not_configured' | null
}

interface ClaimedEvent {
  id: string
  event_id: string
  event_name: string
  payload: Record<string, unknown>
  attempts: number
  /** When the conversion happened. Meta attributes on this, not on send time. */
  created_at: string | Date
}

export async function dispatchPendingTrackingEvents(
  limit = 50,
  db: Database = getDb(),
): Promise<DispatchSummary> {
  const env = serverEnv()
  const pixelId = clientEnv.NEXT_PUBLIC_META_PIXEL_ID
  const token = env.META_CAPI_ACCESS_TOKEN

  if (!pixelId || !token) {
    // Not an error. The funnel is fully functional without CAPI; rows simply
    // accumulate until credentials exist, and are then sent.
    return { claimed: 0, sent: 0, failed: 0, abandoned: 0, skipped: 'not_configured' }
  }

  // Claim a batch atomically. SKIP LOCKED means two overlapping cron runs take
  // disjoint work instead of both sending the same event.
  const claimResult = await db.execute(sql`
    UPDATE tracking_events
    SET attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM tracking_events
      WHERE status IN ('pending', 'failed')
        AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, event_id, event_name, payload, attempts, created_at
  `)

  const claimed = claimResult.rows as unknown as ClaimedEvent[]
  if (claimed.length === 0) {
    await markExhausted(db)
    return { claimed: 0, sent: 0, failed: 0, abandoned: 0, skipped: null }
  }

  let sent = 0
  let failed = 0

  for (const event of claimed) {
    try {
      await sendToMeta(event, pixelId, token, env.META_CAPI_TEST_EVENT_CODE)
      await db
        .update(trackingEvents)
        .set({ status: 'sent', sentAt: new Date(), lastError: '' })
        .where(eq(trackingEvents.id, event.id))
      sent += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      await db
        .update(trackingEvents)
        .set({ status: 'failed', lastError: message.slice(0, 500) })
        .where(eq(trackingEvents.id, event.id))
      failed += 1
      log.warn('tracking.dispatch_failed', {
        eventId: event.event_id,
        attempt: event.attempts,
        err: message,
      })
    }
  }

  const abandoned = await markExhausted(db)

  log.info('tracking.dispatch_complete', { claimed: claimed.length, sent, failed, abandoned })
  return { claimed: claimed.length, sent, failed, abandoned, skipped: null }
}

/**
 * Retire events that have burned through their retries.
 *
 * They stop being retried but are NOT deleted: an abandoned row is the
 * evidence that ad reporting under-counts, and the dashboard surfaces it.
 */
async function markExhausted(db: Database): Promise<number> {
  const result = await db.execute(sql`
    UPDATE tracking_events
    SET status = 'abandoned'
    WHERE status = 'failed' AND attempts >= ${MAX_ATTEMPTS}
    RETURNING id
  `)
  return result.rows.length
}

async function sendToMeta(
  event: ClaimedEvent,
  pixelId: string,
  accessToken: string,
  testEventCode: string,
): Promise<void> {
  const payload = event.payload ?? {}
  const email = typeof payload['email'] === 'string' ? payload['email'] : ''
  const value = typeof payload['value'] === 'number' ? payload['value'] : 0
  const currency = typeof payload['currency'] === 'string' ? payload['currency'] : 'BDT'

  // Meta requires identifiers to be SHA-256 of the normalised value. The raw
  // address never leaves this process.
  const userData: Record<string, string[]> = {}
  if (email) userData['em'] = [sha256Hex(email.trim().toLowerCase())]

  // The purchase time, not the dispatch time. This queue is drained on a
  // schedule that can lag the sale by up to a day, and Meta's attribution
  // window is measured from event_time: stamping "now" would credit every
  // conversion to the wrong day and, past the click window, to no ad at all.
  const occurredAt = new Date(event.created_at).getTime()
  const eventTime = Math.floor((Number.isFinite(occurredAt) ? occurredAt : Date.now()) / 1000)

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: event.event_name,
        event_time: eventTime,
        event_id: event.event_id,
        action_source: 'website',
        event_source_url: `${clientEnv.NEXT_PUBLIC_SITE_URL}/thank-you`,
        user_data: userData,
        custom_data: { value, currency },
      },
    ],
  }
  if (testEventCode) body['test_event_code'] = testEventCode

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      },
    )

    const text = await response.text()
    if (!response.ok) {
      // Truncated, and the access token is in the query string rather than the
      // body, so it cannot appear in this message.
      throw new Error(`Meta returned HTTP ${response.status}: ${text.slice(0, 200)}`)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Meta did not respond within ${REQUEST_TIMEOUT_MS} ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
