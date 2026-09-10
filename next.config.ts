import type { NextConfig } from 'next'

/**
 * Security headers.
 *
 * Content-Security-Policy is deliberately NOT set here as a blanket static
 * header: the Meta Pixel and GA4 snippets are injected with a per-request
 * nonce in src/app/layout.tsx, and a static policy cannot carry a nonce.
 * The CSP is emitted in middleware.ts where the nonce is generated.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // The funnel is Bengali-first. This is the document language and affects
  // font fallback selection in every major browser.
  //
  // NOTE: no i18n routing block. One locale ships today; strings live in
  // src/config and the CMS, not hardcoded in components, so adding a locale
  // later is a content change rather than a rewrite.

  // Typed <Link href> checking against the real route tree.
  typedRoutes: true,

  // This project sits inside a directory that has its own package-lock.json
  // one level up. Without this, Next infers the parent as the workspace root
  // and traces the wrong file set into the serverless bundle.
  outputFileTracingRoot: __dirname,

  images: {
    // Only the cover art and OG image are raster. Everything else is text/SVG.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // The paid download must never be cached by a CDN or a shared proxy.
        source: '/api/download/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        // Payment endpoints are per-request and must never be cached.
        source: '/api/checkout/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ]
  },
}

export default nextConfig
