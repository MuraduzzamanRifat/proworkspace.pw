import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge middleware: content security policy and indexing control.
 *
 * A NOTE ON THE CSP, because the weak part should be stated rather than
 * discovered later.
 *
 * `script-src` includes 'unsafe-inline'. The strict alternative is a per-request
 * nonce, but generating one requires reading headers during render, which forces
 * every page to be dynamic. The landing page is the single most
 * performance-sensitive surface in this funnel and it is statically generated
 * with a 1-minute revalidate; making it dynamic to harden against inline-script
 * injection would trade a certain, measurable regression for a hypothetical one.
 *
 * What still holds without a nonce: `default-src 'self'` plus an explicit host
 * allowlist means an injected script cannot load remote code or exfiltrate to an
 * arbitrary origin, `object-src 'none'` and `base-uri 'self'` close two classic
 * bypasses, and `frame-ancestors 'none'` blocks clickjacking of the checkout.
 *
 * Revisit if inline scripts are ever eliminated (JSON-LD and the pixel snippet
 * are the only two), at which point 'unsafe-inline' can simply be dropped.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.facebook.com https://www.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data:",
  "connect-src 'self' https://www.facebook.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

/**
 * Routes that must never appear in a search index.
 *
 * The metadata `robots` export already covers these per page, but a header is
 * belt and braces: it also applies to the API responses under these paths, and
 * it cannot be lost by a rendering change.
 */
const NOINDEX_PREFIXES = ['/admin', '/checkout', '/thank-you', '/payment', '/api']

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl

  response.headers.set('Content-Security-Policy', CSP)

  if (NOINDEX_PREFIXES.some((p) => pathname.startsWith(p))) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  }

  return response
}

export const config = {
  // Skip static assets and image optimisation: they need no policy and the
  // middleware invocation would be pure overhead on every asset request.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
}
