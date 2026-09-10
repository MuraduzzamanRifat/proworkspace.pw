/**
 * Brand, legal and contact configuration.
 *
 * Non-secret settings only. Anything with a credential in it belongs in the
 * environment (src/config/env.ts), never here and never in an admin-editable
 * field.
 */

export const SITE = {
  brand: 'ProWorkspace',
  locale: 'bn-BD',
  /** BCP-47 tag for <html lang>. */
  htmlLang: 'bn',
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  /** Bangladesh does not observe DST, so a fixed offset is safe for display. */
  utcOffsetMinutes: 360,
} as const

/**
 * Legal pages.
 *
 * `body: null` means "not written yet". Pages with a null body render a 404
 * rather than an empty shell, and `missingPolicies()` reports them so they show
 * up as launch blockers instead of being silently missing.
 */
export interface PolicyPage {
  slug: string
  title: string
  /** Markdown. null = not yet written by the owner. */
  body: string | null
  /** Whether checkout is allowed to complete while this is unwritten. */
  blocksLaunch: boolean
}

export const POLICIES: readonly PolicyPage[] = [
  {
    slug: 'refund-policy',
    title: 'ফেরত নীতি',
    // DELIBERATELY NULL. sales/landing-copy.md line 179 is an unfilled
    // placeholder: "[আপনার নীতি এখানে লিখুন]". The FAQ entry that would answer
    // "ফেরত পাওয়ার সুযোগ আছে?" is omitted rather than answered with a guess.
    // For a digital product "no refunds" is a perfectly legal position, but it
    // is the owner's call and it must be stated, not assumed.
    body: null,
    blocksLaunch: true,
  },
  {
    slug: 'privacy-policy',
    title: 'গোপনীয়তা নীতি',
    body: null,
    blocksLaunch: true,
  },
  {
    slug: 'terms',
    title: 'শর্তাবলী',
    body: null,
    blocksLaunch: true,
  },
  {
    slug: 'contact',
    title: 'যোগাযোগ',
    body: null,
    blocksLaunch: true,
  },
] as const

/** Policy pages that are still unwritten and gate launch. */
export function missingPolicies(): readonly PolicyPage[] {
  return POLICIES.filter((p) => p.body === null && p.blocksLaunch)
}

/**
 * Payment methods named in customer-facing copy.
 *
 * Populated from what the gateway actually offers once it is live. Empty means
 * the CTA microcopy must not name any method. sales/cartflows/HANDOFF.md
 * records the same decision being made for the WordPress build: naming
 * "বিকাশ/নগদ/কার্ড" before a gateway existed would have been a false claim.
 */
// 2026-09-10: taken from the owner's live WooCommerce checkout on
// proworkspace.online, which states "বিকাশ / নগদ / রকেট" on the same gateway.
// That is the owner's own claim on a page that takes money today, which is a
// stronger source than a single scrape of the hosted invoice page.
export const PAYMENT_METHODS_ADVERTISED: readonly string[] = ['বিকাশ', 'নগদ', 'রকেট']
