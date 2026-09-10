import { loadPublishedPage } from '@/cms/load'
import { BOOK, PRODUCT } from '@/config/product'
import { LandingPage } from '@/components/landing/LandingPage'
import { getCatalogue } from '@/services/catalogue'
import { getFlags } from '@/services/flags'

/**
 * Public landing page.
 *
 * Content: published CMS sections (database), rendered on the server.
 * Prices: the offers table, via the catalogue.
 * Cache: ISR, regenerated at most once a minute, and immediately when the
 * admin publishes (revalidatePath in the publish action). A visitor never
 * waits on the database: they get the last generated HTML while the next one
 * is built in the background.
 */
export const revalidate = 60

export default async function HomePage() {
  const [page, catalogue, flags] = await Promise.all([loadPublishedPage(), getCatalogue(), getFlags()])
  const { product, primary } = catalogue

  const faq = page.sections.find((s) => s.type === 'faq')
  const faqItems = faq
    ? (faq.content as { items: Array<{ question: string; answer: string; enabled: boolean }> }).items.filter(
        (i) => i.enabled && i.question.trim(),
      )
    : []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: product.title,
        description: product.subtitle,
        brand: { '@type': 'Brand', name: PRODUCT.brand },
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
      ...(faqItems.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faqItems.map((f) => ({
                '@type': 'Question',
                name: f.question,
                acceptedAnswer: { '@type': 'Answer', text: f.answer },
              })),
            },
          ]
        : []),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <LandingPage page={page} catalogue={catalogue} stickyCta={flags.stickyCta} />
    </>
  )
}
