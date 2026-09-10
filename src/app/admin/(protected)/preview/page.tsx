import type { Metadata } from 'next'

import { loadDraftPage } from '@/cms/load'
import { LandingPage } from '@/components/landing/LandingPage'
import { getCatalogue } from '@/services/catalogue'
import { getFlags } from '@/services/flags'

/**
 * Draft preview.
 *
 * Renders the DRAFT of every section through the exact component the public
 * page uses, so what the admin sees is what publishing will produce. Lives
 * under /admin, so it is behind the session gate and carries the noindex
 * header from middleware. Production content is not touched.
 */
export const metadata: Metadata = {
  title: 'প্রিভিউ (খসড়া)',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function PreviewPage() {
  const [page, catalogue, flags] = await Promise.all([loadDraftPage(), getCatalogue(), getFlags()])
  return <LandingPage page={page} catalogue={catalogue} preview stickyCta={flags.stickyCta} />
}
