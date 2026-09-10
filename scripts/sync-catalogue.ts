import { Pool, neonConfig } from '@neondatabase/serverless'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

import { BOOK, OFFERS, PRODUCT } from '../src/config/product'
import * as schema from '../src/db/schema'

/**
 * Push the product/offer CONFIG into an EXISTING database, prices included.
 *
 *   npm run db:sync-catalogue
 *
 * The seed deliberately never overwrites a price on conflict, because after
 * launch the database is the source of truth and the admin edits it there.
 * This script is the explicit exception for when the config itself is the
 * change — a product relaunch — and it is loud about what it changed: every
 * before/after is written to audit_logs and printed.
 *
 * It updates the single existing product and offer rows IN PLACE rather than
 * inserting new ones, so historical order_items (which snapshot SKU, title
 * and price at purchase time) are untouched and old orders still read
 * exactly as they were charged.
 */
neonConfig.webSocketConstructor = ws

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })

  const products = await db.select().from(schema.products).orderBy(asc(schema.products.createdAt))
  if (products.length !== 1) {
    console.error(`Expected exactly one product row, found ${products.length}. Refusing to guess.`)
    await pool.end()
    process.exit(2)
  }
  const product = products[0]!

  const offers = await db.select().from(schema.offers).where(eq(schema.offers.productId, product.id))
  if (offers.length !== 1 || OFFERS.length !== 1) {
    console.error(`Expected exactly one offer in DB and config, found ${offers.length} / ${OFFERS.length}.`)
    await pool.end()
    process.exit(2)
  }
  const offer = offers[0]!
  const target = OFFERS[0]!

  const productBefore = {
    slug: product.slug,
    sku: product.sku,
    title: product.title,
    subtitle: product.subtitle,
    author: product.author,
    deliverables: product.deliverables,
  }
  const productAfter = {
    slug: PRODUCT.slug,
    sku: PRODUCT.sku,
    title: PRODUCT.title,
    subtitle: PRODUCT.subtitle,
    author: PRODUCT.author,
    deliverables: PRODUCT.deliverables.map((d) => ({
      key: d.key,
      label: d.label,
      detail: d.detail,
      filename: d.filename,
    })),
  }
  const offerBefore = {
    code: offer.code,
    label: offer.label,
    listPricePoisha: offer.listPricePoisha,
    pricePoisha: offer.pricePoisha,
  }
  const offerAfter = {
    code: target.code,
    label: target.label,
    listPricePoisha: target.listPrice,
    pricePoisha: target.price,
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.products)
      .set({
        ...productAfter,
        facts: {
          bookTitle: BOOK.title,
          bookAuthor: BOOK.author,
          pageCount: BOOK.pageCount,
          chapterCount: BOOK.chapterCount,
          appendixCount: BOOK.appendixCount,
          promptCount: BOOK.promptCount,
          caseStudyCount: BOOK.caseStudyCount,
          edition: BOOK.edition,
          version: BOOK.version,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.products.id, product.id))

    await tx
      .update(schema.offers)
      .set({
        ...offerAfter,
        isDefault: target.isDefault,
        isPopular: target.isPopular,
        sortOrder: target.sortOrder,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.offers.id, offer.id))

    await tx.insert(schema.auditLogs).values([
      {
        actorId: null,
        actorEmail: 'scripts/sync-catalogue',
        action: 'catalogue.product_synced',
        entityType: 'product',
        entityId: product.id,
        before: productBefore,
        after: productAfter,
      },
      {
        actorId: null,
        actorEmail: 'scripts/sync-catalogue',
        action: 'catalogue.offer_synced',
        entityType: 'offer',
        entityId: offer.id,
        before: offerBefore,
        after: offerAfter,
      },
    ])
  })

  console.log('product')
  console.log(`  title  ${productBefore.title}  ->  ${productAfter.title}`)
  console.log(`  sku    ${productBefore.sku}  ->  ${productAfter.sku}`)
  console.log(`  files  ${productBefore.deliverables.length}  ->  ${productAfter.deliverables.length}`)
  console.log('offer')
  console.log(`  code   ${offerBefore.code}  ->  ${offerAfter.code}`)
  console.log(`  price  ${offerBefore.pricePoisha}  ->  ${offerAfter.pricePoisha} poisha`)
  console.log(`  list   ${offerBefore.listPricePoisha}  ->  ${offerAfter.listPricePoisha} poisha`)
  console.log('audit rows written: 2')

  await pool.end()
}

main().catch((err: unknown) => {
  console.error('sync failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
