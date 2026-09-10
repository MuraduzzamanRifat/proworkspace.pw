import type { MetadataRoute } from 'next'

import { clientEnv } from '@/config/env'

/**
 * robots.txt
 *
 * Everything that is not the landing page is disallowed. On a single-product
 * funnel there is exactly one page worth indexing; checkout, the thank-you
 * page, payment return and the admin all leak either private state or
 * duplicate content into the index.
 *
 * This duplicates the X-Robots-Tag header set in src/middleware.ts on purpose.
 * A crawler that ignores one usually honours the other, and the header also
 * covers API responses that never appear in a sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/checkout', '/thank-you', '/payment', '/api'],
      },
    ],
    sitemap: `${clientEnv.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
    host: clientEnv.NEXT_PUBLIC_SITE_URL,
  }
}
