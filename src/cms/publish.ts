import { SECTION_DEFINITIONS } from '@/cms/registry'
import { isSectionType, validateSectionContent, type CtaAction, type SectionType } from '@/cms/schemas'

/**
 * The publish gate.
 *
 * Pure: takes the draft page and the live offer, returns problems. The
 * server action refuses to publish while `errors` is non-empty. Warnings are
 * shown but do not block.
 *
 * The rule of thumb for what is an error: anything that would leave a
 * customer unable to understand or buy the product. A missing hero headline,
 * a Buy button pointing nowhere, an offer with no price, a scroll link to a
 * section that is disabled. Cosmetic gaps are warnings.
 */

export interface DraftSectionForPublish {
  key: string
  type: string
  enabled: boolean
  sortOrder: number
  content: unknown
}

export interface OfferForPublish {
  code: string
  pricePoisha: number
  isActive: boolean
  isDefault: boolean
}

export interface PublishProblem {
  key: string
  message: string
}

export interface PublishCheck {
  errors: PublishProblem[]
  warnings: PublishProblem[]
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function lines(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}
function ctaOf(v: unknown): { label: string; action: CtaAction | null } {
  if (typeof v !== 'object' || v === null) return { label: '', action: null }
  const o = v as { label?: unknown; action?: unknown }
  return { label: str(o.label), action: (o.action as CtaAction) ?? null }
}

/** Every CTA-shaped value inside a section's content, wherever it sits. */
function collectCtas(content: unknown, path = ''): Array<{ path: string; label: string; action: CtaAction }> {
  const out: Array<{ path: string; label: string; action: CtaAction }> = []
  if (typeof content !== 'object' || content === null) return out
  for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k
    if (typeof v === 'object' && v !== null && 'action' in (v as object)) {
      const c = ctaOf(v)
      if (c.action) out.push({ path: p, label: c.label, action: c.action })
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => out.push(...collectCtas(item, `${p}[${i}]`)))
    } else if (typeof v === 'object' && v !== null) {
      out.push(...collectCtas(v, p))
    }
  }
  return out
}

export function checkPublish(sections: DraftSectionForPublish[], offers: OfferForPublish[]): PublishCheck {
  const errors: PublishProblem[] = []
  const warnings: PublishProblem[] = []

  // --- Commerce ------------------------------------------------------------
  const active = offers.filter((o) => o.isActive)
  if (active.length === 0) {
    errors.push({ key: 'offer', message: 'কোনো সক্রিয় অফার নেই — ক্রেতা কিছু কিনতে পারবেন না।' })
  }
  if (active.some((o) => o.pricePoisha <= 0)) {
    errors.push({ key: 'offer', message: 'একটি সক্রিয় অফারের দাম শূন্য বা ঋণাত্মক।' })
  }
  if (active.length > 0 && !active.some((o) => o.isDefault)) {
    warnings.push({ key: 'offer', message: 'কোনো অফার ডিফল্ট হিসেবে চিহ্নিত নয়; প্রথমটি ব্যবহৃত হবে।' })
  }

  // --- Structure -----------------------------------------------------------
  const enabledKeys = new Set(sections.filter((s) => s.enabled).map((s) => s.key))

  const hero = sections.find((s) => s.type === 'hero')
  if (!hero) errors.push({ key: 'hero', message: 'হিরো সেকশন নেই।' })
  else if (!hero.enabled) errors.push({ key: 'hero', message: 'হিরো সেকশন বন্ধ করা আছে; পেজের প্রথম অংশ থাকতেই হবে।' })

  // --- Per-section ---------------------------------------------------------
  for (const s of sections) {
    if (!isSectionType(s.type)) {
      errors.push({ key: s.key, message: `অজানা সেকশন টাইপ "${s.type}"` })
      continue
    }
    const type: SectionType = s.type

    const schemaIssues = validateSectionContent(type, s.content)
    for (const issue of schemaIssues) errors.push({ key: s.key, message: issue })
    if (schemaIssues.length > 0) continue

    const c = (s.content ?? {}) as Record<string, unknown>
    const label = SECTION_DEFINITIONS[type].label

    if (s.enabled) {
      switch (type) {
        case 'hero': {
          if (lines(c.headlineLines).length === 0) errors.push({ key: s.key, message: 'হিরোর মূল শিরোনাম খালি।' })
          const primary = ctaOf(c.primaryCta)
          if (!primary.label) errors.push({ key: s.key, message: 'হিরোর প্রধান বোতামের লেখা খালি।' })
          if (primary.action?.type === 'none') errors.push({ key: s.key, message: 'হিরোর প্রধান বোতামের কোনো গন্তব্য নেই।' })
          if (!str(c.subheadline)) warnings.push({ key: s.key, message: 'হিরোর উপশিরোনাম খালি।' })
          break
        }
        case 'intro':
        case 'benefits':
        case 'steps':
        case 'trust':
        case 'testimonials':
        case 'faq':
          if (!str(c.heading)) warnings.push({ key: s.key, message: `${label}: শিরোনাম খালি।` })
          break
        case 'book':
          if (!str(c.heading)) errors.push({ key: s.key, message: `${label}: শিরোনাম খালি।` })
          break
        case 'bonus':
          if (!str(c.title)) errors.push({ key: s.key, message: `${label}: শিরোনাম খালি।` })
          break
        case 'finalCta': {
          if (!str(c.heading)) errors.push({ key: s.key, message: 'শেষ আহ্বানের শিরোনাম খালি।' })
          const cta = ctaOf(c.cta)
          if (!cta.label) errors.push({ key: s.key, message: 'শেষ আহ্বানের বোতামের লেখা খালি।' })
          break
        }
        case 'offer':
          if (!str(c.ctaLabel)) errors.push({ key: s.key, message: 'অফার সেকশনের বোতামের লেখা খালি।' })
          break
        case 'seo':
          if (!str(c.title)) errors.push({ key: s.key, message: 'SEO শিরোনাম খালি।' })
          if (!str(c.description)) warnings.push({ key: s.key, message: 'মেটা বিবরণ খালি।' })
          if (str(c.title).length > 70) warnings.push({ key: s.key, message: 'SEO শিরোনাম ৭০ অক্ষরের বেশি; সার্চে কেটে যেতে পারে।' })
          if (c.index === false) warnings.push({ key: s.key, message: 'পেজটি সার্চ ইঞ্জিন থেকে লুকানো (noindex) আছে।' })
          break
        default:
          break
      }

      // Scroll targets must point at something that will actually be on the page.
      for (const cta of collectCtas(c)) {
        if (cta.action.type === 'scroll' && !enabledKeys.has(cta.action.target)) {
          errors.push({ key: s.key, message: `বোতাম "${cta.label || cta.path}" এমন সেকশনে নিয়ে যায় যা নেই বা বন্ধ (${cta.action.target})।` })
        }
        if (cta.label && cta.action.type === 'none') {
          warnings.push({ key: s.key, message: `বোতাম "${cta.label}"-এর কোনো গন্তব্য নেই, তাই দেখাবে না।` })
        }
      }
    }
  }

  return { errors, warnings }
}
