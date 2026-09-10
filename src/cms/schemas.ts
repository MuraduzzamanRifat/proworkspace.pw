import { z } from 'zod'

/**
 * CMS content schemas.
 *
 * Every section type has a zod schema here. The schema is the contract on
 * BOTH sides: the admin validates against it before saving a draft, and the
 * renderer parses stored JSON through it on every read, so a row that somehow
 * holds bad data degrades to defaults instead of crashing the landing page.
 *
 * Nothing here accepts HTML. Long text may carry a tiny safe markup
 * (**bold**, *italic*, [text](https://…), line breaks) that is rendered to
 * React elements by src/components/landing/RichText.tsx, never to innerHTML.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const HTTPS = /^https:\/\/[^\s<>"']+$/i

/** An https URL or empty. javascript:, data:, file: and http: are all refused. */
export const safeHttpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === '' || HTTPS.test(v), { message: 'শুধু https:// লিংক গ্রহণযোগ্য' })

export const shortText = z.string().trim().max(200)
export const longText = z.string().trim().max(4000)
export const lines = z.array(z.string().trim().max(400)).max(40)

export const imageSchema = z.object({
  url: safeHttpsUrl.default(''),
  alt: shortText.default(''),
})
export type ImageValue = z.infer<typeof imageSchema>

/** Anchors are section keys; only this shape is a valid scroll target. */
export const anchorId = z.string().regex(/^[a-z0-9-]{1,40}$/, 'সঠিক সেকশন আইডি নয়')

export const ctaActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('checkout') }),
  z.object({ type: z.literal('scroll'), target: anchorId }),
  z.object({ type: z.literal('external'), url: safeHttpsUrl.refine((v) => v !== '', 'লিংক দিন') }),
  z.object({ type: z.literal('internal'), path: z.string().regex(/^\/[a-z0-9\-\/]*$/, 'সঠিক পাথ নয়') }),
  z.object({ type: z.literal('none') }),
])
export type CtaAction = z.infer<typeof ctaActionSchema>

export const ctaSchema = z.object({
  label: z.string().trim().max(80).default(''),
  action: ctaActionSchema.default({ type: 'checkout' }),
})
export type CtaValue = z.infer<typeof ctaSchema>

/** Predefined looks only. No CSS ever comes from the CMS. */
export const themeSchema = z.enum(['flat', 'raised']).default('flat')
export const layoutSchema = z.enum(['centered', 'image-left', 'image-right']).default('centered')
export const iconSchema = z.enum(['check', 'spark', 'bolt', 'book', 'gear', 'chart', 'shield', 'star']).default('check')

const itemId = z.string().min(1).max(64)

// ---------------------------------------------------------------------------
// Section schemas
// ---------------------------------------------------------------------------

export const heroSchema = z.object({
  eyebrow: shortText.default(''),
  headlineLines: lines.default([]),
  /** A phrase inside the headline to render in the accent colour. Optional. */
  highlightText: shortText.default(''),
  subheadline: longText.default(''),
  bonusIntro: shortText.default(''),
  bonusItems: lines.default([]),
  bookMeta: shortText.default(''),
  image: imageSchema.default({ url: '', alt: '' }),
  mobileImage: imageSchema.default({ url: '', alt: '' }),
  videoUrl: safeHttpsUrl.default(''),
  primaryCta: ctaSchema.default({ label: '', action: { type: 'checkout' } }),
  secondaryCta: ctaSchema.default({ label: '', action: { type: 'none' } }),
  /** The price itself is bound to the offer; this controls whether it shows. */
  showPrice: z.boolean().default(true),
  trustLine: shortText.default(''),
  badge: shortText.default(''),
})

export const introSchema = z.object({
  heading: shortText.default(''),
  sub: longText.default(''),
  lead: longText.default(''),
  items: lines.default([]),
  closing: longText.default(''),
  cta: ctaSchema.default({ label: '', action: { type: 'checkout' } }),
  theme: themeSchema,
})

export const bookSchema = z.object({
  heading: longText.default(''),
  tagline: lines.default([]),
  title: shortText.default(''),
  subtitle: shortText.default(''),
  lead: longText.default(''),
  paragraphs: z.array(longText).max(12).default([]),
  authorLine: shortText.default(''),
  quote: longText.default(''),
  image: imageSchema.default({ url: '', alt: '' }),
  videoUrl: safeHttpsUrl.default(''),
  cta: ctaSchema.default({ label: '', action: { type: 'none' } }),
  theme: themeSchema,
  layout: layoutSchema,
})

export const benefitItemSchema = z.object({
  id: itemId,
  icon: iconSchema,
  title: shortText.default(''),
  description: longText.default(''),
  enabled: z.boolean().default(true),
})
export const benefitsSchema = z.object({
  heading: shortText.default(''),
  sub: longText.default(''),
  items: z.array(benefitItemSchema).max(30).default([]),
  theme: themeSchema,
})

export const bonusSchema = z.object({
  badge: shortText.default(''),
  title: shortText.default(''),
  sub: longText.default(''),
  lead: longText.default(''),
  usesHeading: shortText.default(''),
  uses: lines.default([]),
  whyHeading: shortText.default(''),
  why: z.array(longText).max(10).default([]),
  valueLabel: shortText.default(''),
  notice: longText.default(''),
  noticeTone: z.enum(['neutral', 'warning']).default('neutral'),
  image: imageSchema.default({ url: '', alt: '' }),
  cta: ctaSchema.default({ label: '', action: { type: 'checkout' } }),
  theme: themeSchema,
})

export const stepItemSchema = z.object({
  id: itemId,
  number: shortText.default(''),
  title: shortText.default(''),
  body: longText.default(''),
  enabled: z.boolean().default(true),
})
export const stepsSchema = z.object({
  heading: shortText.default(''),
  steps: z.array(stepItemSchema).max(12).default([]),
  cta: ctaSchema.default({ label: '', action: { type: 'checkout' } }),
  theme: themeSchema,
})

export const audienceSchema = z.object({
  forHeading: shortText.default(''),
  forLead: longText.default(''),
  forItems: lines.default([]),
  forNote: longText.default(''),
  notHeading: shortText.default(''),
  notLead: longText.default(''),
  notItems: lines.default([]),
  closing: z.array(longText).max(6).default([]),
})

export const trustItemSchema = z.object({
  id: itemId,
  title: shortText.default(''),
  description: longText.default(''),
  image: imageSchema.default({ url: '', alt: '' }),
  documentUrl: safeHttpsUrl.default(''),
  enabled: z.boolean().default(true),
})
export const trustSchema = z.object({
  heading: shortText.default(''),
  sub: longText.default(''),
  items: z.array(trustItemSchema).max(20).default([]),
  theme: themeSchema,
})

export const testimonialItemSchema = z.object({
  id: itemId,
  name: shortText.default(''),
  meta: shortText.default(''),
  review: longText.default(''),
  rating: z.number().int().min(1).max(5).default(5),
  photo: imageSchema.default({ url: '', alt: '' }),
  date: z.string().trim().max(40).default(''),
  verified: z.boolean().default(false),
  enabled: z.boolean().default(true),
})
export const testimonialsSchema = z.object({
  heading: shortText.default(''),
  sub: longText.default(''),
  items: z.array(testimonialItemSchema).max(50).default([]),
})

/**
 * The offer section's numbers come from the offers/deliverables tables.
 * Templates may use {list} (struck list price), {price} and {pct}.
 */
export const offerSchema = z.object({
  headingTemplate: shortText.default(''),
  subTemplate: shortText.default(''),
  breakdownHeading: shortText.default(''),
  priceCaption: shortText.default(''),
  ctaLabel: shortText.default(''),
  note: longText.default(''),
  theme: themeSchema,
})

export const faqItemSchema = z.object({
  id: itemId,
  question: shortText.default(''),
  answer: longText.default(''),
  enabled: z.boolean().default(true),
})
export const faqSchema = z.object({
  heading: shortText.default(''),
  items: z.array(faqItemSchema).max(40).default([]),
})

export const finalCtaSchema = z.object({
  heading: shortText.default(''),
  body: longText.default(''),
  cta: ctaSchema.default({ label: '', action: { type: 'checkout' } }),
  trustLine: shortText.default(''),
  image: imageSchema.default({ url: '', alt: '' }),
  backgroundImage: imageSchema.default({ url: '', alt: '' }),
  showPrice: z.boolean().default(true),
  theme: themeSchema,
})

export const footerLinkSchema = z.object({
  id: itemId,
  label: shortText.default(''),
  action: ctaActionSchema.default({ type: 'none' }),
})
export const socialLinkSchema = z.object({
  id: itemId,
  network: z.enum(['facebook', 'youtube', 'instagram', 'linkedin', 'x', 'whatsapp', 'telegram', 'other']).default('other'),
  url: safeHttpsUrl.default(''),
})
export const footerSchema = z.object({
  brandLine: longText.default(''),
  logo: imageSchema.default({ url: '', alt: '' }),
  copyright: shortText.default(''),
  email: z.string().trim().max(254).default(''),
  phone: shortText.default(''),
  address: longText.default(''),
  links: z.array(footerLinkSchema).max(12).default([]),
  social: z.array(socialLinkSchema).max(10).default([]),
})

export const seoSchema = z.object({
  title: z.string().trim().max(120).default(''),
  description: z.string().trim().max(320).default(''),
  canonical: safeHttpsUrl.default(''),
  ogTitle: z.string().trim().max(120).default(''),
  ogDescription: z.string().trim().max(320).default(''),
  ogImage: safeHttpsUrl.default(''),
  twitterImage: safeHttpsUrl.default(''),
  index: z.boolean().default(true),
})

// ---------------------------------------------------------------------------
// Registry of types
// ---------------------------------------------------------------------------

export const SECTION_SCHEMAS = {
  hero: heroSchema,
  intro: introSchema,
  book: bookSchema,
  benefits: benefitsSchema,
  bonus: bonusSchema,
  steps: stepsSchema,
  audience: audienceSchema,
  trust: trustSchema,
  testimonials: testimonialsSchema,
  offer: offerSchema,
  faq: faqSchema,
  finalCta: finalCtaSchema,
  footer: footerSchema,
  seo: seoSchema,
} as const

export type SectionType = keyof typeof SECTION_SCHEMAS
export type SectionContent<T extends SectionType> = z.infer<(typeof SECTION_SCHEMAS)[T]>

export const SECTION_TYPES = Object.keys(SECTION_SCHEMAS) as SectionType[]

export function isSectionType(v: string): v is SectionType {
  return (SECTION_TYPES as string[]).includes(v)
}

/** Parse stored JSON; on failure return the type's defaults plus the issues. */
export function parseSectionContent<T extends SectionType>(
  type: T,
  data: unknown,
): { content: SectionContent<T>; issues: string[] } {
  const schema = SECTION_SCHEMAS[type]
  const result = schema.safeParse(data ?? {})
  if (result.success) return { content: result.data as SectionContent<T>, issues: [] }
  const fallback = schema.parse({}) as SectionContent<T>
  return {
    content: fallback,
    issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  }
}

/** Human-readable validation errors, used by the admin forms and the publish gate. */
export function validateSectionContent(type: SectionType, data: unknown): string[] {
  const result = SECTION_SCHEMAS[type].safeParse(data ?? {})
  if (result.success) return []
  return result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
}
