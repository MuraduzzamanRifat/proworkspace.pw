/**
 * Database schema.
 *
 * Conventions used throughout, and the reasons for them:
 *
 * - Every money column is a plain integer named `*_poisha`. Naming the unit in
 *   the column makes a taka/poisha mix-up visible in a code review instead of
 *   in a bank reconciliation. ৳1,990 is stored as 199000.
 *
 * - `order_items` is a SNAPSHOT. It duplicates the product title, SKU, offer
 *   label and every amount as they were at purchase time, and it has no
 *   foreign key back to `products`. Changing today's price must not rewrite
 *   last month's receipts.
 *
 * - Idempotency is enforced by unique indexes in the database, not by
 *   application checks. `payments.gateway_invoice_id` and
 *   `webhook_events.event_key` are UNIQUE, so a duplicate webhook loses a race
 *   against the constraint rather than creating a second order.
 *
 * - Secrets never live here. API keys and signing secrets come from the
 *   environment. The `settings` table is for non-secret operational config the
 *   owner may change without a deploy.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { ORDER_STATES } from '@/domain/order-state'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orderStatusEnum = pgEnum('order_status', ORDER_STATES)

export const adminRoleEnum = pgEnum('admin_role', [
  'super_admin',
  'admin',
  'marketing',
  'support',
])

export const couponKindEnum = pgEnum('coupon_kind', ['percent', 'fixed'])

export const contentStatusEnum = pgEnum('content_status', ['draft', 'published'])

export const trackingStatusEnum = pgEnum('tracking_status', [
  'pending',
  'sent',
  'failed',
  'abandoned',
])

// ---------------------------------------------------------------------------
// Admin identity
// ---------------------------------------------------------------------------

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    /** scrypt hash, format: scrypt$N$r$p$salt$hash — see src/lib/password.ts */
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull().default(''),
    role: adminRoleEnum('role').notNull().default('support'),
    isActive: boolean('is_active').notNull().default(true),
    /** Brute-force mitigation state. */
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('admin_users_email_unique').on(t.email),
  }),
)

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** SHA-256 of the session token. The raw token exists only in the cookie. */
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address').notNull().default(''),
    userAgent: text('user_agent').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('admin_sessions_token_hash_unique').on(t.tokenHash),
    userIdx: index('admin_sessions_user_idx').on(t.userId),
    expiryIdx: index('admin_sessions_expiry_idx').on(t.expiresAt),
  }),
)

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    sku: text('sku').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    author: text('author').notNull().default(''),
    description: text('description').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    /** Verified facts printed in marketing copy. Kept here so the admin can
     *  correct them without a deploy, and so every surface reads one number. */
    facts: jsonb('facts').$type<Record<string, number | string>>().notNull().default({}),
    /** Deliverable names shown to the buyer. Not file paths. */
    deliverables: jsonb('deliverables').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex('products_slug_unique').on(t.slug),
    skuUnique: uniqueIndex('products_sku_unique').on(t.sku),
  }),
)

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    label: text('label').notNull(),
    listPricePoisha: integer('list_price_poisha').notNull(),
    pricePoisha: integer('price_poisha').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    isPopular: boolean('is_popular').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeUnique: uniqueIndex('offers_code_unique').on(t.code),
    productIdx: index('offers_product_idx').on(t.productId),
  }),
)

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    kind: couponKindEnum('kind').notNull(),
    /** Percent 0-100 when kind='percent'; poisha when kind='fixed'. */
    value: integer('value').notNull(),
    minOrderPoisha: integer('min_order_poisha').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxRedemptions: integer('max_redemptions'),
    timesRedeemed: integer('times_redeemed').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Stored upper-cased by the application so lookups are case-insensitive.
    codeUnique: uniqueIndex('coupons_code_unique').on(t.code),
  }),
)

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Lower-cased at write time. The natural key for a guest-checkout funnel. */
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    /** Denormalised lifetime figures, recomputed on each completed order. */
    orderCount: integer('order_count').notNull().default(0),
    totalSpentPoisha: integer('total_spent_poisha').notNull().default(0),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('customers_email_unique').on(t.email),
  }),
)

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Human-readable, shown to the customer and in support conversations. */
    orderNumber: text('order_number').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),

    /** Contact details captured at checkout, snapshotted onto the order. */
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    phone: text('phone').notNull().default(''),

    status: orderStatusEnum('status').notNull().default('pending'),

    subtotalPoisha: integer('subtotal_poisha').notNull(),
    discountPoisha: integer('discount_poisha').notNull().default(0),
    shippingPoisha: integer('shipping_poisha').notNull().default(0),
    taxPoisha: integer('tax_poisha').notNull().default(0),
    totalPoisha: integer('total_poisha').notNull(),
    refundedPoisha: integer('refunded_poisha').notNull().default(0),
    currency: text('currency').notNull().default('BDT'),

    couponCode: text('coupon_code'),

    /**
     * Idempotency key supplied by the checkout client. A repeat submit with the
     * same key returns the original order instead of creating a second one.
     */
    idempotencyKey: text('idempotency_key'),

    /** First-touch and last-touch marketing attribution, captured at checkout. */
    attribution: jsonb('attribution').$type<Record<string, string>>().notNull().default({}),

    notes: text('notes').notNull().default(''),

    paidAt: timestamp('paid_at', { withTimezone: true }),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orderNumberUnique: uniqueIndex('orders_order_number_unique').on(t.orderNumber),
    idempotencyUnique: uniqueIndex('orders_idempotency_key_unique').on(t.idempotencyKey),
    emailIdx: index('orders_email_idx').on(t.email),
    statusIdx: index('orders_status_idx').on(t.status),
    createdIdx: index('orders_created_idx').on(t.createdAt),
  }),
)

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /**
     * Deliberately NOT a foreign key to products/offers.
     * This row is a receipt. It must survive the product being renamed,
     * re-priced or deleted.
     */
    productSku: text('product_sku').notNull(),
    productTitle: text('product_title').notNull(),
    offerCode: text('offer_code').notNull(),
    offerLabel: text('offer_label').notNull(),

    quantity: integer('quantity').notNull().default(1),
    unitListPricePoisha: integer('unit_list_price_poisha').notNull(),
    unitPricePoisha: integer('unit_price_poisha').notNull(),
    discountPoisha: integer('discount_poisha').notNull().default(0),
    shippingPoisha: integer('shipping_poisha').notNull().default(0),
    taxPoisha: integer('tax_poisha').notNull().default(0),
    lineTotalPoisha: integer('line_total_poisha').notNull(),
    currency: text('currency').notNull().default('BDT'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orderIdx: index('order_items_order_idx').on(t.orderId),
  }),
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    provider: text('provider').notNull().default('uddoktapay'),
    /**
     * The gateway's invoice id. UNIQUE: this single constraint is what makes
     * duplicate webhooks, browser refreshes and retry storms safe.
     */
    gatewayInvoiceId: text('gateway_invoice_id').notNull(),
    /** Hosted checkout URL, so an idempotent replay can re-send the customer
     *  to the same unpaid invoice instead of opening a second one. */
    gatewayPaymentUrl: text('gateway_payment_url').notNull().default(''),
    gatewayTransactionId: text('gateway_transaction_id').notNull().default(''),
    paymentMethod: text('payment_method').notNull().default(''),
    senderNumber: text('sender_number').notNull().default(''),

    /** What the gateway says it collected, independent of what we asked for. */
    amountPoisha: integer('amount_poisha').notNull(),
    feePoisha: integer('fee_poisha').notNull().default(0),
    chargedAmountPoisha: integer('charged_amount_poisha').notNull().default(0),
    currency: text('currency').notNull().default('BDT'),

    /** Raw gateway status string, kept verbatim for support and audit. */
    gatewayStatus: text('gateway_status').notNull().default(''),
    /** Full verified payload. Never contains card data; the gateway never sends it. */
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull().default({}),

    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    invoiceUnique: uniqueIndex('payments_gateway_invoice_unique').on(t.gatewayInvoiceId),
    orderIdx: index('payments_order_idx').on(t.orderId),
  }),
)

/**
 * Abandoned checkouts.
 *
 * A row is written the moment a customer submits contact details, before the
 * gateway handoff. If they never come back, this is the recovery list.
 */
export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    email: text('email').notNull().default(''),
    name: text('name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    offerCode: text('offer_code').notNull().default(''),
    attribution: jsonb('attribution').$type<Record<string, string>>().notNull().default({}),
    completed: boolean('completed').notNull().default(false),
    recoveryEmailSentAt: timestamp('recovery_email_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index('checkout_sessions_email_idx').on(t.email),
    completedIdx: index('checkout_sessions_completed_idx').on(t.completed),
  }),
)

// ---------------------------------------------------------------------------
// Digital delivery
// ---------------------------------------------------------------------------

export const downloadGrants = pgTable(
  'download_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Opaque public identifier used in the download URL. */
    publicId: text('public_id').notNull(),
    email: text('email').notNull(),
    /** null = unlimited. Set to a finite number to cap sharing. */
    maxDownloads: integer('max_downloads'),
    downloadCount: integer('download_count').notNull().default(0),
    /** null = never expires. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Set when a full refund revokes access. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    publicIdUnique: uniqueIndex('download_grants_public_id_unique').on(t.publicId),
    orderIdx: index('download_grants_order_idx').on(t.orderId),
  }),
)

export const downloadEvents = pgTable(
  'download_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => downloadGrants.id, { onDelete: 'cascade' }),
    ipAddress: text('ip_address').notNull().default(''),
    userAgent: text('user_agent').notNull().default(''),
    succeeded: boolean('succeeded').notNull().default(true),
    reason: text('reason').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grantIdx: index('download_events_grant_idx').on(t.grantId),
  }),
)

// ---------------------------------------------------------------------------
// Content management: draft -> preview -> publish, with rollback
// ---------------------------------------------------------------------------

export const contentSections = pgTable(
  'content_sections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    label: text('label').notNull().default(''),
    /** Currently live content. Null until first publish. */
    publishedData: jsonb('published_data').$type<Record<string, unknown>>(),
    /** Work in progress. Rendered only on the preview route. */
    draftData: jsonb('draft_data').$type<Record<string, unknown>>(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    keyUnique: uniqueIndex('content_sections_key_unique').on(t.key),
  }),
)

/** Every publish appends a row here, so any previous version can be restored. */
export const contentVersions = pgTable(
  'content_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => contentSections.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: contentStatusEnum('status').notNull().default('published'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    publishedBy: uuid('published_by').references(() => adminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sectionVersionUnique: uniqueIndex('content_versions_section_version_unique').on(
      t.sectionId,
      t.version,
    ),
  }),
)

// ---------------------------------------------------------------------------
// Operational config
// ---------------------------------------------------------------------------

export const settings = pgTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').$type<unknown>().notNull(),
    label: text('label').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
)

export const featureFlags = pgTable(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    enabled: boolean('enabled').notNull().default(false),
    label: text('label').notNull().default(''),
    description: text('description').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
)

// ---------------------------------------------------------------------------
// Audit and integrity
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email').notNull().default(''),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull().default(''),
    entityId: text('entity_id').notNull().default(''),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    ipAddress: text('ip_address').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    actorIdx: index('audit_logs_actor_idx').on(t.actorId),
    entityIdx: index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    createdIdx: index('audit_logs_created_idx').on(t.createdAt),
  }),
)

/**
 * Webhook replay protection.
 *
 * `event_key` is UNIQUE. The handler inserts here FIRST; if the insert loses
 * the race, the event is a duplicate and processing stops. This is what makes
 * "the gateway retried the webhook five times" a non-event.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull().default('uddoktapay'),
    eventKey: text('event_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventKeyUnique: uniqueIndex('webhook_events_event_key_unique').on(t.eventKey),
  }),
)

/**
 * Rate limiting counters.
 *
 * Kept in the database rather than in process memory on purpose. Every
 * serverless instance has its own memory, so an in-memory limiter multiplies
 * the real limit by the number of warm instances and protects nothing.
 */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
  count: integer('count').notNull().default(0),
})

/**
 * Server-side tracking outbox.
 *
 * Analytics calls are queued here and dispatched out of band. A failing Meta
 * endpoint must never delay or fail a checkout, so the request path only ever
 * writes a row.
 */
export const trackingEvents = pgTable(
  'tracking_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Shared with the browser pixel so Meta can deduplicate the pair. */
    eventId: text('event_id').notNull(),
    eventName: text('event_name').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: trackingStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error').notNull().default(''),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventIdUnique: uniqueIndex('tracking_events_event_id_unique').on(t.eventId),
    statusIdx: index('tracking_events_status_idx').on(t.status),
  }),
)
