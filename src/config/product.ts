/**
 * Product seed data — "AI Agent Development Bundle" (ProWorkspace).
 *
 * IMPORTANT — this file is the SEED, not the runtime source of truth.
 * At runtime the database owns product and offer configuration (tables
 * `products` and `offers`). `npm run db:seed` writes these values in once and
 * never overwrites a price on conflict; `npm run db:sync-catalogue` is the
 * explicit, audit-logged way to push a config change like this one into an
 * existing database.
 *
 * WHAT THE BUNDLE IS, AND WHAT IT DELIBERATELY IS NOT
 * The copy and structure follow proworkspace.online, the owner's live funnel
 * for this bundle (2026-09-10). That page's "Learn" component is Manning's
 * "AI Agents in Action, Second Edition". Manning owns that book and this
 * project does not carry a licence to redistribute it, so the book slot here
 * is the owner's OWN title — the 275-page Bengali guide in
 * ../ai-agent-ebook-bn — whose facts are verified against the built PDF.
 * The two bonuses are the owner's own assets and carry over unchanged.
 *
 * PROVENANCE OF THE BOOK NUMBERS
 *   claim        sales/landing-copy.md   book.config.json (VERIFIED)   used here
 *   pages        ২৩৮                     ২৭৫                            275
 *   prompts      ৫০                      ৭৬                             76
 *   appendices   ৫                       ৬                              6
 *   systems      ৪                       ৫                              5
 * book.config.json is cross-checked by build/cover.mjs against
 * dist/bundle-master/ebook.pdf; landing-copy.md carries stale numbers.
 */

import { taka, type Poisha } from '@/domain/money'

/** The book inside the bundle. Facts only; every number is verified. */
export const BOOK = {
  title: 'এআই এজেন্ট দিয়ে ইনকাম',
  subtitle: 'n8n, MCP ও অটোমেশনের পূর্ণাঙ্গ বাংলা গাইড',
  author: 'ড্যানিয়াল সিমস',
  publisher: 'Corieosity',
  edition: 'প্রথম সংস্করণ',
  editionMonth: 'আগস্ট ২০২৬',
  version: '1.1.0',
  pageCount: 275,
  chapterCount: 12,
  appendixCount: 6,
  promptCount: 76,
  caseStudyCount: 5,
} as const

/**
 * A file the buyer receives.
 *
 * `key` is the identifier used in download URLs and in the PRODUCT_FILES
 * environment map. `separateValue` is what the item costs on its own; it is
 * the basis of the bundle's list price, so it must be a real price, not a
 * flattering one. The dataset is sold on its own at proworkspace.shop, the
 * ebook at ৳1,990, and the owner prices the template library at ৳2,000.
 */
export interface DeliverableSeed {
  key: 'ebook' | 'workflows' | 'leads'
  label: string
  /** Shown under the label. Keep to one honest line. */
  detail: string
  separateValue: Poisha
  /** Filename offered to the browser on download. */
  filename: string
}

export const DELIVERABLES: readonly DeliverableSeed[] = [
  {
    key: 'ebook',
    label: `${BOOK.title} — সম্পূর্ণ বই (PDF)`,
    detail: `${BOOK.pageCount} পৃষ্ঠা · ${BOOK.chapterCount} অধ্যায় · ${BOOK.promptCount}টি প্রস্তুত প্রম্পট · ওয়ার্কফ্লো ফাইলসহ`,
    separateValue: taka(1990),
    filename: 'ai-agent-diye-income.pdf',
  },
  {
    key: 'workflows',
    label: '4,000 Ready Workflow Templates',
    detail: 'n8n workflow library — ইমপোর্ট করে structure দেখুন, নিজের project অনুযায়ী customize করুন',
    separateValue: taka(2000),
    filename: 'workflow-templates.zip',
  },
  {
    key: 'leads',
    label: '10 Million Email Research Dataset',
    detail: 'Market research ও prospecting preparation-এর data resource — responsible-use notice সহ',
    separateValue: taka(1499),
    filename: 'email-research-dataset.zip',
  },
] as const

export function deliverable(key: DeliverableSeed['key']): DeliverableSeed {
  const found = DELIVERABLES.find((d) => d.key === key)
  if (!found) throw new Error(`Unknown deliverable ${key}`)
  return found
}

/** Sum of the separate prices. This IS the list price; nothing is typed in. */
export function separateValueTotal(): Poisha {
  return DELIVERABLES.reduce((acc, d) => (acc + d.separateValue) as Poisha, 0 as Poisha)
}

export interface ProductSeed {
  slug: string
  sku: string
  title: string
  subtitle: string
  author: string
  brand: string
  fulfilment: 'digital-download'
  deliverables: readonly DeliverableSeed[]
}

export const PRODUCT: ProductSeed = {
  slug: 'ai-agent-development-bundle',
  sku: 'PW-BUNDLE-AIAGENT-001',
  title: 'AI Agent Development Bundle',
  subtitle: 'শুধু Prompt ব্যবহার নয় — বাস্তব AI Agent System তৈরি করা শিখুন',
  author: BOOK.author,
  brand: 'ProWorkspace',
  fulfilment: 'digital-download',
  deliverables: DELIVERABLES,
} as const

export interface OfferSeed {
  code: string
  label: string
  listPrice: Poisha
  price: Poisha
  isDefault: boolean
  isPopular: boolean
  sortOrder: number
}

/**
 * One offer. ৳999 is the owner's live price on proworkspace.online.
 *
 * `listPrice` is computed from the components rather than typed, so the
 * struck-through figure on the page is an arithmetic fact a visitor can
 * check, not an anchor. The owner's page said "৳5,500"; the components sum
 * to ৳5,489, and the page now shows the sum.
 */
export const OFFERS: readonly OfferSeed[] = [
  {
    code: 'bundle',
    label: 'Complete Bundle — বই + ৪,০০০ ওয়ার্কফ্লো + ডেটাসেট',
    listPrice: separateValueTotal(),
    price: taka(999),
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

/** Whole-percent saving versus buying the parts separately, floored. */
export function savingPercent(): number {
  const list = separateValueTotal()
  const price = defaultOffer().price
  if (list <= 0 || price >= list) return 0
  return Math.floor(((list - price) / list) * 100)
}
