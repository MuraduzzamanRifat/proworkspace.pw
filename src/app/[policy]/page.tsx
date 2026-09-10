import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { POLICIES } from '@/config/site'
import { PRODUCT } from '@/config/product'

/**
 * Legal pages: refund, privacy, terms, contact.
 *
 * A policy with `body: null` has not been written yet and returns 404 rather
 * than rendering an empty shell. An empty "Refund Policy" page is worse than
 * no page: it looks like a policy exists and says nothing, which is exactly
 * the ambiguity a refund dispute turns on.
 */
export function generateStaticParams(): Array<{ policy: string }> {
  return POLICIES.filter((p) => p.body !== null).map((p) => ({ policy: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ policy: string }>
}): Promise<Metadata> {
  const { policy: slug } = await params
  const policy = POLICIES.find((p) => p.slug === slug && p.body !== null)
  if (!policy) return { title: 'পাওয়া যায়নি' }
  return {
    title: policy.title,
    alternates: { canonical: `/${policy.slug}` },
  }
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ policy: string }>
}) {
  const { policy: slug } = await params
  const policy = POLICIES.find((p) => p.slug === slug)

  if (!policy || policy.body === null) notFound()

  return (
    <main id="main" className="px-5 py-16">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← ফিরে যান
        </Link>
        <h1 className="mt-6 text-2xl sm:text-3xl">{policy.title}</h1>

        {/* Rendered as pre-wrapped text, not HTML.
            These bodies are authored by the owner and could later come from an
            admin field; passing them through dangerouslySetInnerHTML would make
            a CMS field into a stored-XSS vector for no gain. */}
        <div className="mt-6 whitespace-pre-wrap text-[--color-muted]">{policy.body}</div>

        <p className="mt-12 border-t border-[--color-line] pt-6 text-sm text-[--color-muted]">
          {PRODUCT.brand}
        </p>
      </article>
    </main>
  )
}
