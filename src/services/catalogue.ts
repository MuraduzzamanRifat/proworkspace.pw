import { desc, eq } from 'drizzle-orm'

import { getDb } from '@/db'
import { offers, products } from '@/db/schema'
import { OFFERS, PRODUCT, defaultOffer } from '@/config/product'
import { poisha, type Poisha } from '@/domain/money'
import { log } from '@/lib/logger'

/**
 * Read-side catalogue for public pages.
 *
 * The database is the source of truth. The seed in src/config/product.ts is a
 * fallback used ONLY in development, so `npm run dev` works before anyone has
 * provisioned Neon.
 *
 * In production a database failure throws rather than quietly falling back.
 * Rendering a stale or seed price to a real buyer is worse than an error page:
 * the price they see is the price they will expect to pay.
 */

export interface DisplayOffer {
  code: string
  label: string
  listPrice: Poisha
  price: Poisha
  isPopular: boolean
}

export interface DisplayDeliverable {
  key: string
  label: string
  detail: string
  filename: string
}

export interface DisplayProduct {
  sku: string
  title: string
  subtitle: string
  author: string
  deliverables: readonly DisplayDeliverable[]
}

export interface CatalogueView {
  product: DisplayProduct
  offers: DisplayOffer[]
  primary: DisplayOffer
  source: 'database' | 'seed'
}

function seedView(): CatalogueView {
  const seeded = OFFERS.map((o) => ({
    code: o.code,
    label: o.label,
    listPrice: o.listPrice,
    price: o.price,
    isPopular: o.isPopular,
  }))
  const def = defaultOffer()

  return {
    product: {
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
    },
    offers: seeded,
    primary: {
      code: def.code,
      label: def.label,
      listPrice: def.listPrice,
      price: def.price,
      isPopular: def.isPopular,
    },
    source: 'seed',
  }
}

export async function getCatalogue(): Promise<CatalogueView> {
  // Not provisioned yet is a different situation from broken.
  //
  // With no DATABASE_URL at all — a fresh clone, or `next build` before Neon
  // exists — the seed is used everywhere, including production builds. The
  // seed price is the one printed on the book's back cover, so it is the
  // correct value rather than a placeholder.
  //
  // A DATABASE_URL that IS set but fails is a real fault and still throws in
  // production, because that is the case where the displayed price could be
  // stale relative to what the admin has since changed.
  if (!process.env.DATABASE_URL) {
    log.warn('catalogue.no_database_configured', {})
    return seedView()
  }

  try {
    const db = getDb()
    const rows = await db
      .select({
        offerCode: offers.code,
        offerLabel: offers.label,
        listPrice: offers.listPricePoisha,
        price: offers.pricePoisha,
        isPopular: offers.isPopular,
        isDefault: offers.isDefault,
        sortOrder: offers.sortOrder,
        sku: products.sku,
        title: products.title,
        subtitle: products.subtitle,
        author: products.author,
        deliverables: products.deliverables,
      })
      .from(offers)
      .innerJoin(products, eq(offers.productId, products.id))
      .where(eq(offers.isActive, true))
      .orderBy(offers.sortOrder, desc(offers.isDefault))

    if (rows.length === 0) throw new Error('No active offers in the database')

    const first = rows[0]!
    const mapped: DisplayOffer[] = rows.map((r) => ({
      code: r.offerCode,
      label: r.offerLabel,
      listPrice: poisha(r.listPrice),
      price: poisha(r.price),
      isPopular: r.isPopular,
    }))
    const primary = mapped[rows.findIndex((r) => r.isDefault)] ?? mapped[0]!

    return {
      product: {
        sku: first.sku,
        title: first.title,
        subtitle: first.subtitle,
        author: first.author,
        deliverables: first.deliverables,
      },
      offers: mapped,
      primary,
      source: 'database',
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      log.error('catalogue.unavailable', { err })
      throw err
    }
    log.warn('catalogue.using_seed', {
      reason: err instanceof Error ? err.message : 'unknown',
    })
    return seedView()
  }
}
