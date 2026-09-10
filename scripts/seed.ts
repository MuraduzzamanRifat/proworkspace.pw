import { Pool, neonConfig } from '@neondatabase/serverless'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

import { OFFERS, PRODUCT } from '../src/config/product'
import * as schema from '../src/db/schema'
import { hashPassword, validatePasswordStrength } from '../src/lib/password'

/**
 * Idempotent seed.
 *
 * Running it twice must not create a second product, a second admin, or reset
 * a price the owner has since changed in the admin. Every write is an upsert
 * keyed on a natural unique column, and the product/offer upserts deliberately
 * do NOT overwrite pricing on conflict: the database is the source of truth
 * once it exists, and this file is only ever the starting point.
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

  // --- Product -------------------------------------------------------------
  const productRows = await db
    .insert(schema.products)
    .values({
      slug: PRODUCT.slug,
      sku: PRODUCT.sku,
      title: PRODUCT.title,
      subtitle: PRODUCT.subtitle,
      author: PRODUCT.author,
      isActive: true,
      facts: {
        pageCount: PRODUCT.pageCount,
        chapterCount: PRODUCT.chapterCount,
        appendixCount: PRODUCT.appendixCount,
        promptCount: PRODUCT.promptCount,
        caseStudyCount: PRODUCT.caseStudyCount,
        edition: PRODUCT.edition,
        version: PRODUCT.version,
      },
      deliverables: [...PRODUCT.deliverables],
    })
    // Touch only the descriptive fields. Never the price.
    .onConflictDoUpdate({
      target: schema.products.sku,
      set: { title: PRODUCT.title, subtitle: PRODUCT.subtitle, updatedAt: new Date() },
    })
    .returning({ id: schema.products.id })

  const productId = productRows[0]?.id
  if (!productId) throw new Error('Product upsert returned no row')
  console.log(`product  ${PRODUCT.sku}`)

  // --- Offers --------------------------------------------------------------
  for (const offer of OFFERS) {
    await db
      .insert(schema.offers)
      .values({
        productId,
        code: offer.code,
        label: offer.label,
        listPricePoisha: offer.listPrice,
        pricePoisha: offer.price,
        isDefault: offer.isDefault,
        isPopular: offer.isPopular,
        isActive: true,
        sortOrder: offer.sortOrder,
      })
      // Label may be corrected; price is left alone on purpose.
      .onConflictDoUpdate({
        target: schema.offers.code,
        set: { label: offer.label, updatedAt: new Date() },
      })
    console.log(`offer    ${offer.code}`)
  }

  // --- Feature flags -------------------------------------------------------
  const flags = [
    ['coupons_enabled', false, 'কুপন কোড', 'Show a coupon field at checkout.'],
    ['sticky_cta_enabled', true, 'স্টিকি CTA', 'Mobile sticky buy bar.'],
    ['order_bump_enabled', false, 'অর্ডার বাম্প', 'Reserved. No bump product exists yet.'],
    ['upsell_enabled', false, 'আপসেল', 'Reserved. No upsell product exists yet.'],
    ['reviews_enabled', false, 'রিভিউ', 'Off until real, verifiable reviews exist.'],
  ] as const

  for (const [key, enabled, label, description] of flags) {
    await db
      .insert(schema.featureFlags)
      .values({ key, enabled, label, description })
      .onConflictDoNothing({ target: schema.featureFlags.key })
  }
  console.log(`flags    ${flags.length}`)

  // --- Settings ------------------------------------------------------------
  const settingsRows = [
    ['tax_rate', 0, 'ভ্যাট হার (ভগ্নাংশ)'],
    ['download_max_per_order', null, 'প্রতি অর্ডারে সর্বোচ্চ ডাউনলোড (null = সীমাহীন)'],
    ['support_email', '', 'সহায়তার ইমেইল'],
  ] as const

  for (const [key, value, label] of settingsRows) {
    await db
      .insert(schema.settings)
      // A JS null must land as the JSON value `null`, not SQL NULL: the column
      // is NOT NULL and "no limit" is a real setting, not a missing one.
      .values({ key, value: value === null ? sql`'null'::jsonb` : value, label })
      .onConflictDoNothing({ target: schema.settings.key })
  }
  console.log(`settings ${settingsRows.length}`)

  // --- Bootstrap admin -----------------------------------------------------
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase()
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? ''

  if (email && password) {
    const strength = validatePasswordStrength(password)
    if (!strength.ok) {
      console.error(`ADMIN_BOOTSTRAP_PASSWORD rejected: ${strength.reason}`)
      process.exit(1)
    }

    const existing = await db
      .select({ id: schema.adminUsers.id })
      .from(schema.adminUsers)
      .where(eq(schema.adminUsers.email, email))
      .limit(1)

    if (existing.length > 0) {
      console.log('admin    already exists, left untouched')
    } else {
      await db.insert(schema.adminUsers).values({
        email,
        passwordHash: await hashPassword(password),
        name: 'Owner',
        role: 'super_admin',
        isActive: true,
      })
      console.log(`admin    ${email} created (super_admin)`)
      console.log('         Change this password after first login.')
    }
  } else {
    console.log('admin    skipped (ADMIN_BOOTSTRAP_EMAIL / _PASSWORD not set)')
  }

  await pool.end()
  console.log('\nSeed complete.')
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
