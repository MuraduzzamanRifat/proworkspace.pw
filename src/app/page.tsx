import Link from 'next/link'

import { PRODUCT } from '@/config/product'
import { LANDING } from '@/content/landing'
import { formatBdt } from '@/domain/money'
import { getCatalogue } from '@/services/catalogue'

/**
 * Landing page.
 *
 * Entirely server-rendered. There is no client component on this route and
 * therefore no hydration cost: the only interactive element is a link to
 * /checkout. The FAQ uses <details>, which is native and needs no JavaScript.
 *
 * Revalidated rather than dynamic so the HTML is served from the edge cache.
 * A price edit in the admin appears within a minute.
 */
export const revalidate = 60

export default async function HomePage() {
  const { product, primary } = await getCatalogue()
  const priceLabel = formatBdt(primary.price)
  const hasDiscount = primary.listPrice > primary.price

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Book',
        name: product.title,
        author: { '@type': 'Person', name: product.author },
        inLanguage: 'bn',
        numberOfPages: PRODUCT.pageCount,
        bookFormat: 'https://schema.org/EBook',
        // No aggregateRating and no review. There are no verified reviews for
        // this product, and inventing them would be both a dark pattern and a
        // structured-data violation.
        offers: {
          '@type': 'Offer',
          price: (primary.price / 100).toFixed(2),
          priceCurrency: 'BDT',
          availability: 'https://schema.org/InStock',
          category: 'digital',
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main">
        {/* ---------------------------------------------------------------- */}
        <section className="px-5 pt-16 pb-14 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 text-sm font-semibold tracking-wide text-[--color-accent]">
              {product.subtitle}
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

            <ul className="mt-7 flex flex-wrap justify-center gap-x-3 gap-y-2 text-sm text-[--color-muted]">
              {LANDING.hero.stats.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-[--color-line] bg-[--color-surface] px-4 py-1.5"
                >
                  {s}
                </li>
              ))}
            </ul>

            <div className="mt-10">
              <CtaButton priceLabel={priceLabel} />
              <p className="mt-3 text-sm text-[--color-muted]">{LANDING.hero.ctaSubtext}</p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <Section heading={LANDING.problem.heading}>
          <ul className="space-y-3">
            {LANDING.problem.items.map((item) => (
              <li key={item} className="flex gap-3 text-[--color-muted]">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[--color-line-strong]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section heading={LANDING.solution.heading}>
          <p className="mb-5 text-lg font-semibold text-[--color-ink]">{LANDING.solution.lead}</p>
          <div className="space-y-4 text-[--color-muted]">
            {LANDING.solution.paragraphs.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section heading={LANDING.differentiation.heading} tone="raised">
          <p className="mb-5 text-[--color-muted]">{LANDING.differentiation.lead}</p>
          <ul className="space-y-3">
            {LANDING.differentiation.facts.map((f) => (
              <li key={f.slice(0, 20)} className="flex gap-3 text-[--color-muted]">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[--color-accent]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-l-2 border-[--color-accent] pl-4 font-semibold text-[--color-ink]">
            {LANDING.differentiation.closing}
          </p>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section heading={LANDING.contents.heading}>
          <div className="grid gap-8 sm:grid-cols-3">
            {LANDING.contents.groups.map((g) => (
              <div key={g.title}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">
                  {g.title}
                </h3>
                <ul className="space-y-2 text-sm text-[--color-muted]">
                  {g.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <h3 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-[--color-accent]">
            {LANDING.contents.appendixHeading}
          </h3>
          <ul className="grid gap-2 text-sm text-[--color-muted] sm:grid-cols-2">
            {LANDING.contents.appendices.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section heading={LANDING.honesty.heading} tone="raised">
          <p className="mb-5 text-[--color-muted]">{LANDING.honesty.lead}</p>
          <ul className="space-y-3">
            {LANDING.honesty.items.map((i) => (
              <li key={i.slice(0, 20)} className="flex gap-3 text-[--color-muted]">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[--color-line-strong]" />
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section heading={LANDING.audience.heading}>
          <ul className="grid gap-4 sm:grid-cols-3">
            {LANDING.audience.items.map((a) => (
              <li
                key={a.who}
                className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5"
              >
                <p className="font-semibold text-[--color-ink]">{a.who}</p>
                <p className="mt-1 text-sm text-[--color-muted]">{a.detail}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <section className="px-5 py-14">
          <div className="mx-auto max-w-2xl rounded-2xl border border-[--color-line] bg-[--color-surface] p-8 text-center">
            <h2 className="text-2xl">{LANDING.price.heading}</h2>
            <p className="mt-4 flex items-baseline justify-center gap-3">
              {hasDiscount && (
                <span className="text-xl text-[--color-line-strong] line-through">
                  {formatBdt(primary.listPrice)}
                </span>
              )}
              <span className="text-4xl font-bold text-[--color-ink]">{priceLabel}</span>
            </p>
            <p className="mt-4 text-[--color-muted]">{LANDING.price.includes}</p>
            <p className="mx-auto mt-5 max-w-lg border-t border-[--color-line] pt-5 text-sm text-[--color-muted]">
              {LANDING.price.comparison}
            </p>
            <div className="mt-8">
              <CtaButton priceLabel={priceLabel} />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <Section heading="সাধারণ প্রশ্ন">
          <div className="space-y-3">
            {LANDING.faq.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-[--color-line] bg-[--color-surface] px-5 py-4"
              >
                <summary className="cursor-pointer list-none font-semibold text-[--color-ink] marker:content-none">
                  {f.q}
                </summary>
                <p className="mt-3 text-[--color-muted]">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <section className="px-5 pb-24 pt-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl sm:text-3xl">{LANDING.finalCta.heading}</h2>
            <p className="mt-4 text-[--color-muted]">{LANDING.finalCta.body}</p>
            <div className="mt-8">
              <CtaButton priceLabel={priceLabel} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[--color-line] px-5 py-10 text-center text-sm text-[--color-muted]">
        <p>
          {product.title} — {product.author}
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} {PRODUCT.brand}
        </p>
      </footer>
    </>
  )
}

function CtaButton({ priceLabel }: { priceLabel: string }) {
  return (
    <Link
      href="/checkout"
      className="inline-block rounded-xl bg-[--color-cta] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-[--color-cta-hover]"
    >
      {priceLabel} — {LANDING.hero.ctaLabel}
    </Link>
  )
}

function Section({
  heading,
  children,
  tone = 'flat',
}: {
  heading: string
  children: React.ReactNode
  tone?: 'flat' | 'raised'
}) {
  return (
    <section className={`px-5 py-14 ${tone === 'raised' ? 'bg-[--color-surface]/40' : ''}`}>
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-6 text-2xl sm:text-3xl">{heading}</h2>
        {children}
      </div>
    </section>
  )
}
