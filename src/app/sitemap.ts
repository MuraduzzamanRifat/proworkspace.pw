import type { MetadataRoute } from 'next'

import { clientEnv } from '@/config/env'
import { POLICIES } from '@/config/site'

/**
 * sitemap.xml
 *
 * Lists the landing page plus any legal page that has actually been written.
 * A policy whose `body` is still null renders a 404, so listing it here would
 * feed Search Console a soft-404 and nothing else.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = clientEnv.NEXT_PUBLIC_SITE_URL
  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]

  for (const policy of POLICIES) {
    if (policy.body === null) continue
    entries.push({
      url: `${base}/${policy.slug}`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    })
  }

  return entries
}
