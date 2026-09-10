import Link from 'next/link'

import type { RenderedPage, RenderedSection } from '@/cms/load'
import type { CtaAction, CtaValue, ImageValue, SectionContent } from '@/cms/schemas'
import { BOOK, DELIVERABLES, PRODUCT } from '@/config/product'
import { formatBdt, poisha, toBengaliDigits } from '@/domain/money'
import type { CatalogueView } from '@/services/catalogue'
import { RichParagraphs, RichText } from './RichText'

/**
 * Renders a page from CMS content. Used by BOTH the public landing route
 * (published content, ISR) and the admin preview route (draft content), so
 * what the admin previews is exactly what customers will get.
 *
 * Every string comes from a validated schema and is rendered as text.
 * Prices come from the catalogue, never from the CMS.
 */

export interface LandingPageProps {
  page: RenderedPage
  catalogue: CatalogueView
  /** Preview banner and no-index behaviour are handled by the route. */
  preview?: boolean
  /** Feature flag: mobile sticky buy bar (Settings → ফানেল). */
  stickyCta?: boolean
}

export function LandingPage({ page, catalogue, preview = false, stickyCta = false }: LandingPageProps) {
  const { primary, product } = catalogue
  const priceLabel = formatBdt(primary.price)
  const listLabel = formatBdt(primary.listPrice)
  const hasDiscount = primary.listPrice > primary.price
  const savingPoisha = hasDiscount ? primary.listPrice - primary.price : 0
  const savingPct = hasDiscount ? Math.floor((savingPoisha / primary.listPrice) * 100) : 0

  const money = { priceLabel, listLabel, hasDiscount, savingPoisha, savingPct }

  return (
    <>
      {preview && (
        <div className="sticky top-0 z-50 bg-[--color-warning] px-4 py-2 text-center text-sm font-semibold text-black">
          খসড়া প্রিভিউ — এটি প্রকাশিত পেজ নয়। ক্রেতারা এটি দেখছেন না।
        </div>
      )}

      <main id="main">
        {page.sections.map((s) => (
          <SectionRenderer key={s.key} section={s} money={money} product={product} />
        ))}
      </main>

      <Footer footer={page.footer} productTitle={product.title} />

      {stickyCta && (
        // Mobile only, CSS only, and padded so it never covers the footer text.
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[--color-line] bg-[--color-surface]/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <span className="text-sm">
              <span className="block text-xs text-[--color-muted]">{product.title}</span>
              <span className="text-lg font-bold">{priceLabel}</span>
            </span>
            <Link href="/checkout" className="rounded-xl bg-[--color-cta] px-5 py-3 text-sm font-semibold text-white">
              এখনই নিন
            </Link>
          </div>
        </div>
      )}
      {stickyCta && <div aria-hidden className="h-20 md:hidden" />}
    </>
  )
}

interface Money {
  priceLabel: string
  listLabel: string
  hasDiscount: boolean
  savingPoisha: number
  savingPct: number
}

function SectionRenderer({
  section,
  money,
  product,
}: {
  section: RenderedSection
  money: Money
  product: CatalogueView['product']
}) {
  switch (section.type) {
    case 'hero':
      return <Hero id={section.key} c={section.content as SectionContent<'hero'>} money={money} />
    case 'intro':
      return <Intro id={section.key} c={section.content as SectionContent<'intro'>} />
    case 'book':
      return <Book id={section.key} c={section.content as SectionContent<'book'>} />
    case 'benefits':
      return <Benefits id={section.key} c={section.content as SectionContent<'benefits'>} />
    case 'bonus':
      return <Bonus id={section.key} c={section.content as SectionContent<'bonus'>} />
    case 'steps':
      return <Steps id={section.key} c={section.content as SectionContent<'steps'>} />
    case 'audience':
      return <Audience id={section.key} c={section.content as SectionContent<'audience'>} />
    case 'trust':
      return <Trust id={section.key} c={section.content as SectionContent<'trust'>} />
    case 'testimonials':
      return <Testimonials id={section.key} c={section.content as SectionContent<'testimonials'>} />
    case 'offer':
      return <Offer id={section.key} c={section.content as SectionContent<'offer'>} money={money} />
    case 'faq':
      return <Faq id={section.key} c={section.content as SectionContent<'faq'>} />
    case 'finalCta':
      return <FinalCta id={section.key} c={section.content as SectionContent<'finalCta'>} money={money} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function hrefFor(action: CtaAction): string | null {
  switch (action.type) {
    case 'checkout':
      return '/checkout'
    case 'scroll':
      return `#${action.target}`
    case 'external':
      return action.url
    case 'internal':
      return action.path
    case 'none':
    default:
      return null
  }
}

/** Renders nothing when the label is empty or the action is "none". */
function Cta({ cta, prefix = '', tone = 'primary' }: { cta: CtaValue; prefix?: string; tone?: 'primary' | 'secondary' }) {
  const href = hrefFor(cta.action)
  const label = cta.label.trim()
  if (!href || !label) return null
  const cls =
    tone === 'primary'
      ? 'inline-block rounded-xl bg-[--color-cta] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-[--color-cta-hover]'
      : 'inline-block rounded-xl border border-[--color-line-strong] px-6 py-3 font-semibold text-[--color-ink] hover:border-[--color-accent]'
  const text = prefix ? `${prefix} ${label}` : label
  if (cta.action.type === 'external') {
    return (
      <a href={href} rel="noopener noreferrer" target="_blank" className={cls}>
        {text}
      </a>
    )
  }
  return (
    <Link href={href as '/checkout'} className={cls}>
      {text}
    </Link>
  )
}

/** Renders nothing for an empty URL; never a broken image. */
function Img({ image, className, sizes }: { image: ImageValue; className?: string; sizes?: string }) {
  if (!image.url) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.url} alt={image.alt} loading="lazy" decoding="async" className={className} sizes={sizes} />
}

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1]! : null
}

/**
 * Click-to-load video facade. The heavy YouTube iframe is not in the initial
 * HTML; only a thumbnail is, and the frame loads when the visitor asks.
 */
function Video({ url, title }: { url: string; title: string }) {
  const id = youTubeId(url)
  if (!id) return null
  return (
    <details className="group mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl border border-[--color-line] bg-black">
      <summary className="relative block cursor-pointer list-none marker:content-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={title} loading="lazy" decoding="async" className="aspect-video w-full object-cover opacity-90" />
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-[--color-cta] px-6 py-3 text-white">▶ ভিডিও দেখুন</span>
        </span>
      </summary>
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </details>
  )
}

function Section({
  id,
  heading,
  sub,
  badge,
  children,
  theme = 'flat',
}: {
  id: string
  heading?: string
  sub?: string
  badge?: string
  children: React.ReactNode
  theme?: 'flat' | 'raised'
}) {
  return (
    <section id={id} className={`scroll-mt-16 px-5 py-14 ${theme === 'raised' ? 'bg-[--color-surface]/40' : ''}`}>
      <div className="mx-auto max-w-3xl">
        {badge && (
          <p className="mb-2 inline-block rounded-full border border-[--color-accent] px-3 py-0.5 text-xs font-semibold tracking-wide text-[--color-accent]">
            {badge}
          </p>
        )}
        {heading && <h2 className="mb-2 text-2xl sm:text-3xl">{heading}</h2>}
        {sub && <p className="mb-6 text-[--color-muted]">{sub}</p>}
        {!sub && heading && <div className="mb-4" />}
        {children}
      </div>
    </section>
  )
}

function Bullets({ items, tone = 'accent' }: { items: readonly string[]; tone?: 'accent' | 'muted' }) {
  const list = items.filter((i) => i.trim() !== '')
  if (list.length === 0) return null
  return (
    <ul className="space-y-3">
      {list.map((item, i) => (
        <li key={`${i}-${item.slice(0, 12)}`} className="flex gap-3 text-[--color-muted]">
          <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'accent' ? 'bg-[--color-accent]' : 'bg-[--color-line-strong]'}`} />
          <span>
            <RichText text={item} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function Checks({ items, cols = 2 }: { items: readonly string[]; cols?: 1 | 2 }) {
  const list = items.filter((i) => i.trim() !== '')
  if (list.length === 0) return null
  return (
    <ul className={`grid gap-2 text-sm text-[--color-muted] ${cols === 2 ? 'sm:grid-cols-2' : ''}`}>
      {list.map((u, i) => (
        <li key={`${i}-${u.slice(0, 12)}`} className="flex gap-2">
          <span aria-hidden className="text-[--color-success]">✓</span>
          <RichText text={u} />
        </li>
      ))}
    </ul>
  )
}

function Headline({ lines, highlight }: { lines: readonly string[]; highlight: string }) {
  const list = lines.filter((l) => l.trim() !== '')
  return (
    <>
      {list.map((line) => {
        if (highlight && line.includes(highlight)) {
          const [before, after] = line.split(highlight, 2)
          return (
            <span key={line} className="block">
              {before}
              <span className="text-[--color-accent]">{highlight}</span>
              {after}
            </span>
          )
        }
        return (
          <span key={line} className="block">
            {line}
          </span>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Hero({ id, c, money }: { id: string; c: SectionContent<'hero'>; money: Money }) {
  const bonuses = c.bonusItems.filter((b) => b.trim() !== '')
  return (
    <section id={id} className="scroll-mt-16 px-5 pt-16 pb-14 sm:pt-24 sm:pb-20">
      <div className="mx-auto max-w-3xl text-center">
        {c.badge && (
          <p className="mb-4 inline-block rounded-full bg-[--color-accent]/15 px-3 py-1 text-xs font-semibold text-[--color-accent]">{c.badge}</p>
        )}
        {c.eyebrow && <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-[--color-accent]">{c.eyebrow}</p>}
        <h1 className="text-3xl leading-snug sm:text-5xl sm:leading-tight">
          <Headline lines={c.headlineLines} highlight={c.highlightText} />
        </h1>
        {c.subheadline && (
          <p className="mx-auto mt-6 max-w-2xl text-base text-[--color-muted] sm:text-lg">
            <RichText text={c.subheadline} />
          </p>
        )}

        {(c.image.url || c.mobileImage.url) && (
          <picture className="mx-auto mt-8 block max-w-2xl">
            {c.mobileImage.url && <source media="(max-width: 640px)" srcSet={c.mobileImage.url} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.image.url || c.mobileImage.url}
              alt={c.image.alt || c.mobileImage.alt}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="w-full rounded-2xl border border-[--color-line]"
            />
          </picture>
        )}

        {c.videoUrl && <Video url={c.videoUrl} title={c.headlineLines.join(' ')} />}

        {(c.bonusIntro || bonuses.length > 0) && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-[--color-line] bg-[--color-surface] p-5 text-left">
            {c.bonusIntro && <p className="text-sm font-semibold text-[--color-ink]">{c.bonusIntro}</p>}
            <ul className="mt-2 space-y-1 text-sm text-[--color-muted]">
              {bonuses.map((b) => (
                <li key={b} className="flex gap-2">
                  <span aria-hidden className="text-[--color-success]">+</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {c.showPrice && (
          <div className="mt-8">
            {money.hasDiscount && (
              <p className="text-sm text-[--color-muted]">
                আলাদা কিনলে <span className="line-through decoration-[--color-line-strong]">{money.listLabel}</span>
              </p>
            )}
            <p className="mt-1">
              <span className="text-sm text-[--color-muted]">বর্তমান অফার মূল্য মাত্র </span>
              <span className="text-4xl font-bold text-[--color-ink]">{money.priceLabel}</span>
            </p>
            {money.hasDiscount && (
              <p className="mt-1 text-sm font-semibold text-[--color-success]">আপনি সাশ্রয় করছেন {formatBdt(poisha(money.savingPoisha))}</p>
            )}
          </div>
        )}

        {c.bookMeta && <p className="mt-5 text-sm text-[--color-muted]">{c.bookMeta}</p>}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Cta cta={c.primaryCta} prefix={c.showPrice ? `${money.priceLabel} এ` : ''} />
          <Cta cta={c.secondaryCta} tone="secondary" />
        </div>
        {c.trustLine && <p className="mt-3 text-sm text-[--color-muted]">{c.trustLine}</p>}
      </div>
    </section>
  )
}

function Intro({ id, c }: { id: string; c: SectionContent<'intro'> }) {
  return (
    <Section id={id} heading={c.heading} sub={c.sub} theme={c.theme}>
      {c.lead && (
        <p className="mb-5 text-[--color-muted]">
          <RichText text={c.lead} />
        </p>
      )}
      <Bullets items={c.items} />
      {c.closing && (
        <p className="mt-6 font-semibold text-[--color-ink]">
          <RichText text={c.closing} />
        </p>
      )}
      <div className="mt-8">
        <Cta cta={c.cta} />
      </div>
    </Section>
  )
}

function Book({ id, c }: { id: string; c: SectionContent<'book'> }) {
  const tagline = c.tagline.filter((t) => t.trim() !== '').join(' ')
  const body = (
    <>
      {tagline && <p className="mb-6 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">{tagline}</p>}
      {c.title && <h3 className="text-2xl">{c.title}</h3>}
      {c.subtitle && <p className="mt-1 text-[--color-muted]">{c.subtitle}</p>}
      {c.lead && (
        <p className="mt-6 text-lg font-semibold text-[--color-ink]">
          <RichText text={c.lead} />
        </p>
      )}
      <div className="mt-4 space-y-4 text-[--color-muted]">
        {c.paragraphs
          .filter((p) => p.trim() !== '')
          .map((p, i) => (
            <p key={i}>
              <RichText text={p} />
            </p>
          ))}
      </div>
      {c.quote && (
        <blockquote className="mt-6 border-l-2 border-[--color-accent] pl-4 italic text-[--color-ink]">
          <RichText text={c.quote} />
        </blockquote>
      )}
      {c.authorLine && <p className="mt-6 text-sm text-[--color-muted]">{c.authorLine}</p>}
      {c.videoUrl && <Video url={c.videoUrl} title={c.title || c.heading} />}
      <div className="mt-6">
        <Cta cta={c.cta} />
      </div>
    </>
  )
  const image = <Img image={c.image} className="w-full rounded-2xl border border-[--color-line]" />

  if (c.layout === 'centered' || !c.image.url) {
    return (
      <Section id={id} heading={c.heading} theme={c.theme}>
        {c.image.url && <div className="mx-auto mb-8 max-w-sm">{image}</div>}
        {body}
      </Section>
    )
  }
  return (
    <section id={id} className={`scroll-mt-16 px-5 py-14 ${c.theme === 'raised' ? 'bg-[--color-surface]/40' : ''}`}>
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-8 text-2xl sm:text-3xl">{c.heading}</h2>
        <div className={`grid items-start gap-8 md:grid-cols-2 ${c.layout === 'image-right' ? 'md:[&>*:first-child]:order-2' : ''}`}>
          <div>{image}</div>
          <div>{body}</div>
        </div>
      </div>
    </section>
  )
}

const ICONS: Record<string, string> = {
  check: '✓',
  spark: '✦',
  bolt: '⚡',
  book: '📘',
  gear: '⚙',
  chart: '📈',
  shield: '🛡',
  star: '★',
}

function Benefits({ id, c }: { id: string; c: SectionContent<'benefits'> }) {
  const items = c.items.filter((i) => i.enabled && (i.title.trim() || i.description.trim()))
  if (items.length === 0) return null
  const simple = items.every((i) => !i.description.trim())
  return (
    <Section id={id} heading={c.heading} sub={c.sub} theme={c.theme}>
      {simple ? (
        <Bullets items={items.map((i) => i.title)} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
              <p className="text-lg" aria-hidden>
                {ICONS[i.icon] ?? '✓'}
              </p>
              <p className="mt-1 font-semibold text-[--color-ink]">{i.title}</p>
              {i.description && (
                <p className="mt-1 text-sm text-[--color-muted]">
                  <RichText text={i.description} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Bonus({ id, c }: { id: string; c: SectionContent<'bonus'> }) {
  return (
    <Section id={id} heading={c.title} sub={c.sub} badge={c.badge} theme={c.theme}>
      <Img image={c.image} className="mb-6 w-full rounded-2xl border border-[--color-line]" />
      {c.lead && (
        <p className="text-[--color-muted]">
          <RichText text={c.lead} />
        </p>
      )}
      {c.usesHeading && <h3 className="mt-6 mb-3 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">{c.usesHeading}</h3>}
      <Checks items={c.uses} />
      {c.whyHeading && <h3 className="mt-6 mb-2 font-semibold">{c.whyHeading}</h3>}
      <div className="space-y-3 text-[--color-muted]">
        {c.why
          .filter((w) => w.trim() !== '')
          .map((w, i) => (
            <p key={i}>
              <RichText text={w} />
            </p>
          ))}
      </div>
      {c.valueLabel && <p className="mt-5 font-semibold text-[--color-success]">{c.valueLabel}</p>}
      {c.notice && (
        <p className={`mt-4 border-l-2 pl-4 text-xs text-[--color-muted] ${c.noticeTone === 'warning' ? 'border-[--color-warning]' : 'border-[--color-line-strong]'}`}>
          <RichText text={c.notice} />
        </p>
      )}
      <div className="mt-8">
        <Cta cta={c.cta} />
      </div>
    </Section>
  )
}

function Steps({ id, c }: { id: string; c: SectionContent<'steps'> }) {
  const steps = c.steps.filter((s) => s.enabled && (s.title.trim() || s.body.trim()))
  if (steps.length === 0) return null
  return (
    <Section id={id} heading={c.heading} theme={c.theme}>
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.id} className="rounded-xl border border-[--color-line] bg-[--color-bg] p-5">
            {s.number && <p className="text-xs font-semibold text-[--color-accent]">{s.number}</p>}
            <p className="mt-1 text-lg font-semibold">{s.title}</p>
            <p className="mt-2 text-sm text-[--color-muted]">
              <RichText text={s.body} />
            </p>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <Cta cta={c.cta} />
      </div>
    </Section>
  )
}

function Audience({ id, c }: { id: string; c: SectionContent<'audience'> }) {
  return (
    <section id={id} className="scroll-mt-16 px-5 py-14">
      <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-[--color-line] bg-[--color-surface] p-6">
          {c.forHeading && <h2 className="text-xl">{c.forHeading}</h2>}
          {c.forLead && <p className="mt-2 text-sm text-[--color-muted]">{c.forLead}</p>}
          <div className="mt-4">
            <Checks items={c.forItems} cols={1} />
          </div>
          {c.forNote && <p className="mt-4 text-xs text-[--color-muted]">{c.forNote}</p>}
        </div>
        <div className="rounded-2xl border border-[--color-line] bg-[--color-surface] p-6">
          {c.notHeading && <h2 className="text-xl">{c.notHeading}</h2>}
          {c.notLead && <p className="mt-2 text-sm text-[--color-muted]">{c.notLead}</p>}
          <ul className="mt-4 space-y-2 text-sm text-[--color-muted]">
            {c.notItems
              .filter((i) => i.trim() !== '')
              .map((i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-[--color-line-strong]">✕</span>
                  {i}
                </li>
              ))}
          </ul>
          <div className="mt-4 space-y-2 text-xs text-[--color-muted]">
            {c.closing
              .filter((x) => x.trim() !== '')
              .map((x, i) => (
                <p key={i}>
                  <RichText text={x} />
                </p>
              ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Trust({ id, c }: { id: string; c: SectionContent<'trust'> }) {
  const items = c.items.filter((i) => i.enabled && i.title.trim())
  if (items.length === 0) return null
  return (
    <Section id={id} heading={c.heading} sub={c.sub} theme={c.theme}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
            <Img image={i.image} className="mb-3 h-12 w-auto" />
            <p className="font-semibold text-[--color-ink]">{i.title}</p>
            {i.description && (
              <p className="mt-1 text-sm text-[--color-muted]">
                <RichText text={i.description} />
              </p>
            )}
            {i.documentUrl && (
              <a href={i.documentUrl} rel="noopener noreferrer" target="_blank" className="mt-2 inline-block text-sm text-[--color-accent] underline">
                নথি দেখুন
              </a>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Testimonials({ id, c }: { id: string; c: SectionContent<'testimonials'> }) {
  const items = c.items.filter((i) => i.enabled && i.review.trim())
  if (items.length === 0) return null
  return (
    <Section id={id} heading={c.heading} sub={c.sub}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((t) => (
          <li key={t.id} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
            <p aria-label={`${t.rating} of 5`} className="text-[--color-warning]">
              {'★'.repeat(t.rating)}
              <span className="text-[--color-line]">{'★'.repeat(5 - t.rating)}</span>
            </p>
            <p className="mt-2 text-[--color-muted]">
              <RichText text={t.review} />
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Img image={t.photo} className="h-10 w-10 rounded-full object-cover" />
              <div className="text-sm">
                <p className="font-semibold text-[--color-ink]">
                  {t.name}
                  {t.verified && <span className="ml-2 text-xs text-[--color-success]">যাচাইকৃত ক্রেতা</span>}
                </p>
                {(t.meta || t.date) && <p className="text-xs text-[--color-muted]">{[t.meta, t.date].filter(Boolean).join(' · ')}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}

function Offer({ id, c, money }: { id: string; c: SectionContent<'offer'>; money: Money }) {
  const vars = { list: money.listLabel, price: money.priceLabel, pct: toBengaliDigits(String(money.savingPct)) }
  return (
    <section id={id} className={`scroll-mt-16 px-5 py-14 ${c.theme === 'raised' ? 'bg-[--color-surface]/40' : ''}`}>
      <div className="mx-auto max-w-2xl rounded-2xl border border-[--color-line] bg-[--color-surface] p-8 text-center">
        {money.hasDiscount && c.headingTemplate && <h2 className="text-2xl">{fill(c.headingTemplate, vars)}</h2>}
        {money.hasDiscount && c.subTemplate && <p className="mt-2 text-[--color-muted]">{fill(c.subTemplate, vars)}</p>}
        {!money.hasDiscount && <h2 className="text-2xl">দাম</h2>}

        <dl className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
          {c.breakdownHeading && (
            <dt className="text-xs font-semibold uppercase tracking-wide text-[--color-accent]">{c.breakdownHeading}</dt>
          )}
          {DELIVERABLES.map((d) => (
            <div key={d.key} className="flex justify-between gap-4">
              <dd className="text-[--color-muted]">{d.label}</dd>
              <dd className="text-[--color-muted]">{formatBdt(d.separateValue)}</dd>
            </div>
          ))}
          {money.hasDiscount && (
            <div className="flex justify-between gap-4 border-t border-[--color-line] pt-2 font-semibold">
              <dd>মোট</dd>
              <dd className="line-through decoration-[--color-line-strong]">{money.listLabel}</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 flex items-baseline justify-center gap-3">
          {c.priceCaption && <span className="text-sm text-[--color-muted]">{c.priceCaption}</span>}
          <span className="text-4xl font-bold text-[--color-ink]">{money.priceLabel}</span>
        </p>
        {c.note && (
          <p className="mt-3 text-sm text-[--color-muted]">
            <RichText text={c.note} />
          </p>
        )}
        <div className="mt-8">
          <Cta cta={{ label: c.ctaLabel, action: { type: 'checkout' } }} prefix={`${money.priceLabel} এ`} />
        </div>
      </div>
    </section>
  )
}

function Faq({ id, c }: { id: string; c: SectionContent<'faq'> }) {
  const items = c.items.filter((i) => i.enabled && i.question.trim())
  if (items.length === 0) return null
  return (
    <Section id={id} heading={c.heading}>
      <div className="space-y-3">
        {items.map((f) => (
          <details key={f.id} className="group rounded-xl border border-[--color-line] bg-[--color-surface] px-5 py-4">
            <summary className="cursor-pointer list-none font-semibold text-[--color-ink] marker:content-none">{f.question}</summary>
            <div className="mt-3 text-[--color-muted]">
              <RichParagraphs text={f.answer} />
            </div>
          </details>
        ))}
      </div>
    </Section>
  )
}

function FinalCta({ id, c, money }: { id: string; c: SectionContent<'finalCta'>; money: Money }) {
  const bg = c.backgroundImage.url ? { backgroundImage: `url("${c.backgroundImage.url.replace(/"/g, '')}")` } : undefined
  return (
    <section id={id} className={`scroll-mt-16 bg-cover bg-center px-5 pb-24 pt-6 ${c.theme === 'raised' ? 'bg-[--color-surface]/40' : ''}`} style={bg}>
      <div className="mx-auto max-w-2xl text-center">
        <Img image={c.image} className="mx-auto mb-6 max-w-xs rounded-2xl" />
        <h2 className="text-2xl sm:text-3xl">{c.heading}</h2>
        {c.body && (
          <p className="mt-4 text-[--color-muted]">
            <RichText text={c.body} />
          </p>
        )}
        <div className="mt-8">
          <Cta cta={c.cta} prefix={c.showPrice ? `${money.priceLabel} এ` : ''} />
        </div>
        {c.trustLine && <p className="mt-3 text-sm text-[--color-muted]">{c.trustLine}</p>}
      </div>
    </section>
  )
}

function Footer({ footer, productTitle }: { footer: SectionContent<'footer'> | null; productTitle: string }) {
  const year = String(new Date().getFullYear())
  if (!footer) {
    return (
      <footer className="border-t border-[--color-line] px-5 py-10 text-center text-sm text-[--color-muted]">
        <p>{productTitle}</p>
        <p className="mt-2">© {year} {PRODUCT.brand}</p>
      </footer>
    )
  }
  const links = footer.links.filter((l) => l.label.trim() && hrefFor(l.action))
  const social = footer.social.filter((s) => s.url)
  return (
    <footer className="border-t border-[--color-line] px-5 py-10 text-center text-sm text-[--color-muted]">
      <Img image={footer.logo} className="mx-auto mb-4 h-8 w-auto" />
      {footer.brandLine && (
        <p className="mx-auto max-w-xl">
          <RichText text={footer.brandLine} />
        </p>
      )}
      {links.length > 0 && (
        <nav aria-label="নীতি" className="mt-4 flex flex-wrap justify-center gap-4">
          {links.map((l) => {
            const href = hrefFor(l.action)!
            return l.action.type === 'external' ? (
              <a key={l.id} href={href} rel="noopener noreferrer" target="_blank" className="hover:text-[--color-ink]">
                {l.label}
              </a>
            ) : (
              <Link key={l.id} href={href as '/'} className="hover:text-[--color-ink]">
                {l.label}
              </Link>
            )
          })}
        </nav>
      )}
      {(footer.email || footer.phone || footer.address) && (
        <p className="mt-4">{[footer.email, footer.phone, footer.address].filter(Boolean).join(' · ')}</p>
      )}
      {social.length > 0 && (
        <p className="mt-4 flex flex-wrap justify-center gap-4">
          {social.map((s) => (
            <a key={s.id} href={s.url} rel="noopener noreferrer" target="_blank" className="hover:text-[--color-ink]">
              {s.network}
            </a>
          ))}
        </p>
      )}
      <p className="mt-4">{fill(footer.copyright || `© {year} ${PRODUCT.brand}`, { year })}</p>
      <p className="mt-1 text-xs text-[--color-line-strong]">{BOOK.publisher}</p>
    </footer>
  )
}
