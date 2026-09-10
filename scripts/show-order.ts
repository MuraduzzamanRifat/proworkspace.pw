import { Pool, neonConfig } from '@neondatabase/serverless'
import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

import * as schema from '../src/db/schema'

/**
 * Support tool: print one order with its items, payment and download grant.
 *
 *   node --env-file=.env.local --import tsx scripts/show-order.ts CRS-XXXXXXXX
 *
 * Read-only. Amounts are shown in poisha as stored, so what you see is what
 * the database holds, not a formatted interpretation of it.
 */
neonConfig.webSocketConstructor = ws

async function main(): Promise<void> {
  const orderNumber = (process.argv[2] ?? '').trim().toUpperCase()
  const url = process.env.DATABASE_URL
  if (!orderNumber || !url) {
    console.error('usage: show-order.ts <ORDER-NUMBER>   (DATABASE_URL must be set)')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })

  const orders = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.orderNumber, orderNumber))
    .limit(1)
  const order = orders[0]
  if (!order) {
    console.log(`order ${orderNumber}: NOT FOUND`)
    await pool.end()
    process.exit(2)
  }

  const [items, payments, grants] = await Promise.all([
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)),
    db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.id))
      .orderBy(desc(schema.payments.createdAt)),
    db.select().from(schema.downloadGrants).where(eq(schema.downloadGrants.orderId, order.id)),
  ])

  console.log(`order        ${order.orderNumber}`)
  console.log(`status       ${order.status}`)
  console.log(`customer     ${order.name} <${order.email}>`)
  console.log(`total        ${order.totalPoisha} poisha  (discount ${order.discountPoisha}, refunded ${order.refundedPoisha})`)
  console.log(`idempotency  ${order.idempotencyKey ?? '(none)'}`)
  console.log(`attribution  ${JSON.stringify(order.attribution)}`)
  console.log(`created      ${order.createdAt.toISOString()}`)
  console.log(`items        ${items.length}`)
  for (const i of items) {
    console.log(`  - ${i.productSku}  ${i.offerCode}  ${i.quantity} x ${i.unitPricePoisha} = ${i.lineTotalPoisha}`)
  }
  console.log(`payments     ${payments.length}`)
  for (const p of payments) {
    console.log(`  - ${p.provider}  invoice=${p.gatewayInvoiceId}  status=${p.gatewayStatus}  amount=${p.amountPoisha}`)
    console.log(`    url=${p.gatewayPaymentUrl}`)
  }
  console.log(`grants       ${grants.length}`)
  for (const g of grants) {
    console.log(`  - ${g.publicId}  downloads=${g.downloadCount}  revoked=${g.revokedAt ? 'yes' : 'no'}`)
  }

  await pool.end()
}

main().catch((err: unknown) => {
  console.error('failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
