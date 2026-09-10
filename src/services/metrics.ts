import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import { getDb, type Database } from '@/db'
import { checkoutSessions, orders, trackingEvents } from '@/db/schema'
import type { OrderState } from '@/domain/order-state'

/**
 * Business metrics.
 *
 * Every figure here comes from the orders table, which is the system of record
 * for money. Analytics platforms are explicitly not consulted: GA4 and the
 * Meta pixel are blocked for a meaningful share of Bangladeshi traffic and
 * would under-report revenue. They measure marketing; this measures the
 * business.
 *
 * Revenue is NET: gross minus anything refunded.
 */

const REVENUE_STATES: OrderState[] = ['paid', 'fulfilled', 'partially_refunded']

export interface DashboardMetrics {
  rangeDays: number
  orderCount: number
  grossRevenuePoisha: number
  refundedPoisha: number
  netRevenuePoisha: number
  averageOrderValuePoisha: number
  paymentFailures: number
  refundedOrders: number
  abandonedCheckouts: number
  /** Completed / (completed + abandoned). Null when there is no data yet. */
  checkoutCompletionRate: number | null
  pendingTrackingEvents: number
  failedTrackingEvents: number
}

export interface RecentOrder {
  id: string
  orderNumber: string
  email: string
  name: string
  status: OrderState
  totalPoisha: number
  createdAt: Date
}

function since(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

export async function getDashboardMetrics(
  rangeDays = 30,
  db: Database = getDb(),
): Promise<DashboardMetrics> {
  const from = since(rangeDays)

  const revenueRows = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      gross: sql<number>`coalesce(sum(${orders.totalPoisha}), 0)::int`,
      refunded: sql<number>`coalesce(sum(${orders.refundedPoisha}), 0)::int`,
    })
    .from(orders)
    .where(and(inArray(orders.status, REVENUE_STATES), gte(orders.createdAt, from)))

  const revenue = revenueRows[0] ?? { orderCount: 0, gross: 0, refunded: 0 }

  const failureRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.status, 'payment_failed'), gte(orders.createdAt, from)))

  const refundRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(inArray(orders.status, ['refunded', 'partially_refunded']), gte(orders.createdAt, from)))

  const abandonedRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.completed, false), gte(checkoutSessions.createdAt, from)))

  const completedRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.completed, true), gte(checkoutSessions.createdAt, from)))

  const trackingRows = await db
    .select({
      status: trackingEvents.status,
      n: sql<number>`count(*)::int`,
    })
    .from(trackingEvents)
    .groupBy(trackingEvents.status)

  const pendingTracking = trackingRows.find((r) => r.status === 'pending')?.n ?? 0
  const failedTracking = trackingRows.find((r) => r.status === 'failed')?.n ?? 0

  const abandoned = abandonedRows[0]?.n ?? 0
  const completed = completedRows[0]?.n ?? 0
  const attempted = abandoned + completed

  const net = revenue.gross - revenue.refunded

  return {
    rangeDays,
    orderCount: revenue.orderCount,
    grossRevenuePoisha: revenue.gross,
    refundedPoisha: revenue.refunded,
    netRevenuePoisha: net,
    averageOrderValuePoisha:
      revenue.orderCount > 0 ? Math.round(net / revenue.orderCount) : 0,
    paymentFailures: failureRows[0]?.n ?? 0,
    refundedOrders: refundRows[0]?.n ?? 0,
    abandonedCheckouts: abandoned,
    checkoutCompletionRate: attempted > 0 ? completed / attempted : null,
    pendingTrackingEvents: pendingTracking,
    failedTrackingEvents: failedTracking,
  }
}

export async function getRecentOrders(
  limit = 20,
  db: Database = getDb(),
): Promise<RecentOrder[]> {
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      email: orders.email,
      name: orders.name,
      status: orders.status,
      totalPoisha: orders.totalPoisha,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
}

/**
 * Business-level alarms.
 *
 * Server uptime is not the thing that costs money. These are the conditions
 * that mean the funnel is broken while every process is still healthy.
 */
export interface HealthAlert {
  severity: 'critical' | 'warning'
  message: string
}

export async function getHealthAlerts(db: Database = getDb()): Promise<HealthAlert[]> {
  const alerts: HealthAlert[] = []
  const from = since(1)

  const startedRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(checkoutSessions)
    .where(gte(checkoutSessions.createdAt, from))

  const paidRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(inArray(orders.status, REVENUE_STATES), gte(orders.createdAt, from)))

  const started = startedRows[0]?.n ?? 0
  const paid = paidRows[0]?.n ?? 0

  // Checkouts starting but nothing completing is the classic signature of a
  // broken gateway credential, and it looks perfectly healthy from the outside.
  if (started >= 5 && paid === 0) {
    alerts.push({
      severity: 'critical',
      message: `গত ২৪ ঘণ্টায় ${started}টি চেকআউট শুরু হয়েছে কিন্তু একটিও পেমেন্ট সম্পন্ন হয়নি।`,
    })
  }

  const failedRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.status, 'payment_failed'), gte(orders.createdAt, from)))

  const failed = failedRows[0]?.n ?? 0
  if (failed > 0 && paid > 0 && failed / (failed + paid) > 0.5) {
    alerts.push({
      severity: 'warning',
      message: `পেমেন্ট ব্যর্থতার হার অস্বাভাবিক বেশি (${failed}/${failed + paid})।`,
    })
  }

  const stuckTracking = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trackingEvents)
    .where(eq(trackingEvents.status, 'failed'))

  const stuck = stuckTracking[0]?.n ?? 0
  if (stuck > 0) {
    alerts.push({
      severity: 'warning',
      message: `${stuck}টি ট্র্যাকিং ইভেন্ট পাঠানো যায়নি। বিজ্ঞাপনের রিপোর্ট কম দেখাবে।`,
    })
  }

  return alerts
}
