import Link from 'next/link'

import { BOOK, PRODUCT } from '@/config/product'
import { LANDING } from '@/content/landing'
import { formatBdt, poisha } from '@/domain/money'
import { getCatalogue } from '@/services/catalogue'

/**
 * Landing page — AI Agent Development Bundle.
 *
 * Entirely server-rendered; no client component, no hydration. The FAQ uses
 * <details>, which needs no JavaScript. Revalidated every minute so a price
 * change in the database reaches the edge cache without a deploy.
 */
export const revalidate = 60

export default async function HomePage() {
  const { product, primary } = await getCatalogue()
  const priceLabel = formatBdt(primary.price)
  const listLabel = formatBdt(primary.listPrice)
  const hasDiscount = primary.listPrice > primary.price
  const savingPoisha = hasDiscount ? primary.listPrice - primary.price : 0
  const savingPct = hasDiscount ? Math.floor((savingPoisha / primary.listPrice) * 100) : 0

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: product.title,
        description: product.subtitle,
        brand: { '@type': 'Brand', name: PRODUCT.brand },
        // No aggregateRating and no review: none are verified.
        offers: {
          '@type': 'Offer',
          price: (primary.price / 100).toFixed(2),
          priceCurrency: 'BDT',
          availability: 'https://schema.org/InStock',
          category: 'digital',
        },
        isRelatedTo: {
          '@type': 'Book',
          name: BOOK.title,
          author: { '@type': 'Person', name: BOOK.author },
          inLanguage: 'bn',
          numberOfPages: BOOK.pageCount,
          bookFormat: 'https://schema.org/EBook',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: LANDING.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main id="main">
        {/* HERO ------------------------------------------------------------ */}
        <section className="px-5 pt-16 pb-14 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-[--color-accent]">
              {LANDING.hero.eyebrow}
            </p>
            <h1 className="text-3xl leading-snug sm:text-5xl sm:leading-tight">
              {LANDING.hero.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-[--color-muted] sm:text-lg">
              {LANDING.hero.subheadline}
            </p>

            <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-[--color-line] bg-[--color-surface] p-5 text-left">
              <p className="text-sm font-semibold text-[--color-ink]">{LANDING.hero.bonusIntro}</p>
              <ul className="mt-2 space-y-1 text-sm text-[--color-muted]">
                {LANDING.hero.bonuses.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span aria-hidden className="text-[--color-success]">
                      +
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <PriceBlock
              priceLabel={priceLabel}
              listLabel={listLabel}
              hasDiscount={hasDiscount}
              savingLabel={formatBdt(poisha(savingPoisha))}
            />

            <p className="mt-5 text-sm text-[--color-muted]">{LANDING.hero.bookMeta}</p>

            <div className="mt-8">
              <CtaButton label={`${priceLabel} এ ${LANDING.hero.ctaLabel}`} />
              <p className="mt-3 text-sm text-[--color-muted]">{LANDING.hero.ctaSubtext}</p>
            </div>
          </div>
        </section>

        {/* AGENTS ---------------------------------------------------------- */}
        <Section heading={LANDING.agents.heading} sub={LANDING.agents.sub}>
          <p className="mb-5 text-[--color-muted]">{LANDING.agents.lead}</p>
          <Bullets items={LANDING.agents.items} tone="accent" />
          <p className="mt-6 font-semibold text-[--color-ink]">{LANDING.agents.closing}</p>
          <div className="mt-8">
            <CtaButton label="Get the eBook + Bonus Bundle" />
          </div>
        </Section>

        {/* BOOK ------------------------------------------------------------ */}
        <Section heading={LANDING.book.heading} tone="raised">
          <p className="mb-6 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">
            {LANDING.book.tagline.join(' ')}
          </p>
          <h3 className="text-2xl">{LANDING.book.title}</h3>
          <p className="mt-1 text-[--color-muted]">{LANDING.book.subtitle}</p>
          <p className="mt-6 text-lg font-semibold text-[--color-ink]">{LANDING.book.lead}</p>
          <div className="mt-4 space-y-4 text-[--color-muted]">
            {LANDING.book.paragraphs.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
          <p className="mt-6 text-sm text-[--color-muted]">{LANDING.book.authorLine}</p>
        </Section>

        {/* PRACTICAL ------------------------------------------------------- */}
        <Section heading={LANDING.practical.heading} sub={LANDING.practical.sub}>
          <Bullets items={LANDING.practical.items} tone="accent" />
        </Section>

        {/* BONUS 1 --------------------------------------------------------- */}
        <Section
          heading={LANDING.bonusWorkflows.title}
          badge={LANDING.bonusWorkflows.badge}
          tone="raised"
        >
          <p className="text-[--color-muted]">{LANDING.bonusWorkflows.lead}</p>
          <h3 className="mt-6 mb-3 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">
            {LANDING.bonusWorkflows.usesHeading}
          </h3>
          <ul className="grid gap-2 text-sm text-[--color-muted] sm:grid-cols-2">
            {LANDING.bonusWorkflows.uses.map((u) => (
              <li key={u} className="flex gap-2">
                <span aria-hidden className="text-[--color-success]">
                  ✓
                </span>
                {u}
              </li>
            ))}
          </ul>
          <h3 className="mt-6 mb-2 font-semibold">{LANDING.bonusWorkflows.whyHeading}</h3>
          <div className="space-y-3 text-[--color-muted]">
            {LANDING.bonusWorkflows.why.map((w) => (
              <p key={w.slice(0, 20)}>{w}</p>
            ))}
          </div>
          <p className="mt-5 font-semibold text-[--color-success]">{LANDING.bonusWorkflows.valueLabel}</p>
          <p className="mt-4 border-l-2 border-[--color-line-strong] pl-4 text-xs text-[--color-muted]">
            {LANDING.bonusWorkflows.technicalNote}
          </p>
        </Section>

        {/* BONUS 2 --------------------------------------------------------- */}
        <Section heading={LANDING.bonusLeads.title} badge={LANDING.bonusLeads.badge} sub={LANDING.bonusLeads.sub}>
          <p className="text-[--color-muted]">{LANDING.bonusLeads.lead}</p>
          <h3 className="mt-6 mb-3 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">
            {LANDING.bonusLeads.usesHeading}
          </h3>
          <ul className="grid gap-2 text-sm text-[--color-muted] sm:grid-cols-2">
            {LANDING.bonusLeads.uses.map((u) => (
              <li key={u} className="flex gap-2">
                <span aria-hidden className="text-[--color-success]">
                  ✓
                </span>
                {u}
              </li>
            ))}
          </ul>
          <p className="mt-5 font-semibold text-[--color-success]">{LANDING.bonusLeads.valueLabel}</p>
          <p className="mt-4 border-l-2 border-[--color-warning] pl-4 text-xs text-[--color-muted]">
            {LANDING.bonusLeads.responsibleNotice}
          </p>
        </Section>

        {/* THREE RESOURCES ------------------------------------------------- */}
        <Section heading={LANDING.threeResources.heading} tone="raised">
          <ol className="grid gap-4 sm:grid-cols-3">
            {LANDING.threeResources.steps.map((s) => (
              <li key={s.n} className="rounded-xl border border-[--color-line] bg-[--color-bg] p-5">
                <p className="text-xs font-semibold text-[--color-accent]">{s.n}</p>
                <p className="mt-1 text-lg font-semibold">{s.title}</p>
                <p className="mt-2 text-sm text-[--color-muted]">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <CtaButton label="Get the guide now" />
          </div>
        </Section>

        {/* FOR / NOT FOR --------------------------------------------------- */}
        <section className="px-5 py-14">
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-[--color-line] bg-[--color-surface] p-6">
              <h2 className="text-xl">{LANDING.forWhom.heading}</h2>
              <p className="mt-2 text-sm text-[--color-muted]">{LANDING.forWhom.lead}</p>
              <ul className="mt-4 space-y-2 text-sm text-[--color-muted]">
                {LANDING.forWhom.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-[--color-success]">
                      ✓
                    </span>
                    {i}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-[--color-muted]">{LANDING.forWhom.note}</p>
            </div>
            <div className="rounded-2xl border border-[--color-line] bg-[--color-surface] p-6">
              <h2 className="text-xl">{LANDING.notFor.heading}</h2>
              <p className="mt-2 text-sm text-[--color-muted]">{LANDING.notFor.lead}</p>
              <ul className="mt-4 space-y-2 text-sm text-[--color-muted]">
                {LANDING.notFor.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-[--color-line-strong]">
                      ✕
                    </span>
                    {i}
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-2 text-xs text-[--color-muted]">
                {LANDING.notFor.closing.map((c) => (
                  <p key={c.slice(0, 20)}>{c}</p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* VALUE ----------------------------------------------------------- */}
        <section className="px-5 py-14">
          <div className="mx-auto max-w-2xl rounded-2xl border border-[--color-line] bg-[--color-surface] p-8 text-center">
            {hasDiscount ? (
              <>
                <h2 className="text-2xl">{LANDING.value.heading(listLabel)}</h2>
                <p className="mt-2 text-[--color-muted]">{LANDING.value.sub(savingPct)}</p>
              </>
            ) : (
              <h2 className="text-2xl">দাম</h2>
            )}

            {/* The list price is the SUM of these lines, computed, not typed. */}
            <dl className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[--color-accent]">
                {LANDING.value.breakdownHeading}
              </dt>
              {LANDING.value.rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-4">
                  <dd className="text-[--color-muted]">{r.label}</dd>
                  <dd className="text-[--color-muted]">{formatBdt(r.value)}</dd>
                </div>
              ))}
              {hasDiscount && (
                <div className="flex justify-between gap-4 border-t border-[--color-line] pt-2 font-semibold">
                  <dd>মোট</dd>
                  <dd className="line-through decoration-[--color-line-strong]">{listLabel}</dd>
                </div>
              )}
            </dl>

            <p className="mt-6 flex items-baseline justify-center gap-3">
              <span className="text-sm text-[--color-muted]">বর্তমান অফার মূল্য</span>
              <span className="text-4xl font-bold text-[--color-ink]">{priceLabel}</span>
            </p>
            <div className="mt-8">
              <CtaButton label={`${priceLabel} এ ${LANDING.value.ctaLabel}`} />
            </div>
          </div>
        </section>

        {/* FAQ ------------------------------------------------------------- */}
        <Section heading="সাধারণ প্রশ্ন">
          <div className="space-y-3">
            {LANDING.faq.map((f) => (
              <details key={f.q} className="group rounded-xl border border-[--color-line] bg-[--color-surface] px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold text-[--color-ink] marker:content-none">
                  {f.q}
                </summary>
                <p className="mt-3 text-[--color-muted]">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* FINAL CTA ------------------------------------------------------- */}
        <section className="px-5 pb-24 pt-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl sm:text-3xl">{LANDING.finalCta.heading}</h2>
            <p className="mt-4 text-[--color-muted]">{LANDING.finalCta.body}</p>
            <div className="mt-8">
              <CtaButton label={`${priceLabel} এ ${LANDING.finalCta.ctaLabel}`} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[--color-line] px-5 py-10 text-center text-sm text-[--color-muted]">
        <p>{product.title}</p>
        <p className="mt-2">
          © {new Date().getFullYear()} {PRODUCT.brand}
        </p>
      </footer>
    </>
  )
}

function PriceBlock({
  priceLabel,
  listLabel,
  hasDiscount,
  savingLabel,
}: {
  priceLabel: string
  listLabel: string
  hasDiscount: boolean
  savingLabel: string
}) {
  return (
    <div className="mt-8">
      {hasDiscount && (
        <p className="text-sm text-[--color-muted]">
          আলাদা কিনলে <span className="line-through decoration-[--color-line-strong]">{listLabel}</span>
        </p>
      )}
      <p className="mt-1">
        <span className="text-sm text-[--color-muted]">বর্তমান অফার মূল্য মাত্র </span>
        <span className="text-4xl font-bold text-[--color-ink]">{priceLabel}</span>
      </p>
      {hasDiscount && (
        <p className="mt-1 text-sm font-semibold text-[--color-success]">আপনি সাশ্রয় করছেন {savingLabel}</p>
      )}
    </div>
  )
}

function CtaButton({ label }: { label: string }) {
  return (
    <Link
      href="/checkout"
      className="inline-block rounded-xl bg-[--color-cta] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-[--color-cta-hover]"
    >
      {label}
    </Link>
  )
}

function Bullets({ items, tone }: { items: readonly string[]; tone: 'accent' | 'muted' }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[--color-muted]">
          <span
            aria-hidden
            className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
              tone === 'accent' ? 'bg-[--color-accent]' : 'bg-[--color-line-strong]'
            }`}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Section({
  heading,
  sub,
  badge,
  children,
  tone = 'flat',
}: {
  heading: string
  sub?: string
  badge?: string
  children: React.ReactNode
  tone?: 'flat' | 'raised'
}) {
  return (
    <section className={`px-5 py-14 ${tone === 'raised' ? 'bg-[--color-surface]/40' : ''}`}>
      <div className="mx-auto max-w-3xl">
        {badge && (
          <p className="mb-2 inline-block rounded-full border border-[--color-accent] px-3 py-0.5 text-xs font-semibold tracking-wide text-[--color-accent]">
            {badge}
          </p>
        )}
        <h2 className="mb-2 text-2xl sm:text-3xl">{heading}</h2>
        {sub && <p className="mb-6 text-[--color-muted]">{sub}</p>}
        {!sub && <div className="mb-4" />}
        {children}
      </div>
    </section>
  )
}
