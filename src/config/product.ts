/**
 * Product seed data — "এআই এজেন্ট দিয়ে ইনকাম".
 *
 * IMPORTANT — this file is the SEED, not the runtime source of truth.
 * At runtime the database owns product and offer configuration (see
 * src/db/schema.ts, tables `products` and `offers`) so the admin can change
 * price and copy without a deploy. `npm run db:seed` writes these values in
 * once. After that, edit in the admin, not here.
 *
 * PROVENANCE OF THE NUMBERS BELOW
 * Two sources in ../ai-agent-ebook-bn disagree, and this file deliberately
 * follows the verified one:
 *
 *   claim        sales/landing-copy.md   book.config.json (VERIFIED)   used here
 *   pages        ২৩৮                     ২৭৫                            275
 *   prompts      ৫০                      ৭৬                             76
 *   appendices   ৫                       ৬                              6
 *   systems      ৪                       ৫                              5
 *
 * sales/cartflows/HANDOFF.md records that book.config.json is cross-checked by
 * build/cover.mjs against the built PDF (dist/bundle-master/ebook.pdf = 275
 * pages) and that landing-copy.md carries stale pre-release numbers. Shipping
 * the marketing copy's numbers would be an unverified claim on a paid product,
 * so the verified set wins and the landing copy is corrected on render.
 */

import { taka, type Poisha } from '@/domain/money'

export interface ProductSeed {
  slug: string
  sku: string
  /** Bengali title as printed on the cover. */
  title: string
  subtitle: string
  author: string
  brand: string
  edition: string
  version: string
  /** Verified against the built PDF. */
  pageCount: number
  chapterCount: number
  appendixCount: number
  promptCount: number
  caseStudyCount: number
  /** A digital product: no weight, no shipping, no stock. */
  fulfilment: 'digital-download'
  /** Files a buyer receives. Names only; the bytes live in private storage. */
  deliverables: readonly string[]
}

export const PRODUCT: ProductSeed = {
  slug: 'ai-agent-diye-income',
  sku: 'CRS-EBOOK-AIAGENT-BN-001',
  title: 'এআই এজেন্ট দিয়ে ইনকাম',
  subtitle: 'n8n, MCP ও অটোমেশনের পূর্ণাঙ্গ বাংলা গাইড',
  author: 'ড্যানিয়াল সিমস',
  brand: 'Corieosity',
  edition: 'প্রথম সংস্করণ',
  version: '1.1.0',
  pageCount: 275,
  chapterCount: 12,
  appendixCount: 6,
  promptCount: 76,
  caseStudyCount: 5,
  fulfilment: 'digital-download',
  deliverables: [
    'সম্পূর্ণ বই (PDF)',
    'ওয়ার্কফ্লো লাইব্রেরি (ইমপোর্ট করার মতো JSON)',
    'প্রস্তুত প্রম্পট সংকলন',
    'আজীবন হালনাগাদ',
  ],
} as const

export interface OfferSeed {
  code: string
  label: string
  /** List price before any discount. */
  listPrice: Poisha
  /** What the customer actually pays. Equal to listPrice when not discounted. */
  price: Poisha
  isDefault: boolean
  isPopular: boolean
  sortOrder: number
}

/**
 * Exactly one offer ships.
 *
 * The offer system (multiple tiers, "most popular" flags, bundle pricing) is
 * fully built in the schema and the pricing engine because that is cheap to do
 * up front and expensive to retrofit. It is seeded with one row because one
 * real offer exists. Inventing a "2-pack" or a struck-through fake list price
 * for a single PDF would be a dark pattern, and the book's own evidence policy
 * argues against it.
 *
 * Price ৳১,৯৯০ comes from book.config.json PRICE_BDT, which is printed on the
 * physical back cover, so it cannot drift without a reprint.
 */
export const OFFERS: readonly OfferSeed[] = [
  {
    code: 'standard',
    label: 'সম্পূর্ণ বই + ওয়ার্কফ্লো + প্রম্পট',
    listPrice: taka(1990),
    price: taka(1990),
    isDefault: true,
    isPopular: false,
    sortOrder: 1,
  },
] as const

export function defaultOffer(): OfferSeed {
  const found = OFFERS.find((o) => o.isDefault)
  if (!found) throw new Error('Product seed has no default offer')
  return found
}
