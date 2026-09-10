import type { Metadata, Viewport } from 'next'
import { Anek_Bangla, Hind_Siliguri } from 'next/font/google'

import { Analytics as VercelAnalytics } from '@vercel/analytics/next'

import { Analytics } from '@/components/Analytics'
import { clientEnv } from '@/config/env'
import { BOOK, PRODUCT } from '@/config/product'
import { SITE } from '@/config/site'
import './globals.css'

/**
 * Fonts are self-hosted by next/font at build time. That removes the
 * fonts.googleapis.com round trip entirely, which was the single largest
 * contributor to first paint on the WordPress version of this funnel
 * (6 families x 18 weights, no preconnect, no font-display).
 *
 * Four faces total, `display: swap`, so text is readable immediately.
 */
const anekBangla = Anek_Bangla({
  subsets: ['bengali'],
  weight: ['600', '700'],
  variable: '--font-anek-bangla',
  display: 'swap',
  fallback: ['Noto Sans Bengali', 'system-ui', 'sans-serif'],
})

const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali'],
  weight: ['400', '600'],
  variable: '--font-hind-siliguri',
  display: 'swap',
  fallback: ['Noto Sans Bengali', 'system-ui', 'sans-serif'],
})

export const viewport: Viewport = {
  themeColor: '#08090B',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${PRODUCT.title} — ${PRODUCT.subtitle}`,
    template: `%s | ${PRODUCT.brand}`,
  },
  description:
    `${BOOK.title} (${BOOK.pageCount} পৃষ্ঠা, ${BOOK.chapterCount} অধ্যায়) + 4,000 n8n workflow templates ` +
    `+ 10 million email research dataset — এক Bundle-এ। শুধু Prompt নয়, বাস্তব AI Agent System তৈরি করা শিখুন।`,
  authors: [{ name: PRODUCT.author }],
  creator: PRODUCT.brand,
  publisher: PRODUCT.brand,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'bn_BD',
    siteName: PRODUCT.brand,
    title: `${PRODUCT.title} — ${PRODUCT.subtitle}`,
    description: `${BOOK.title} + 4,000 workflow templates + 10M email research dataset।`,
  },
  twitter: {
    card: 'summary_large_image',
    title: PRODUCT.title,
    description: PRODUCT.subtitle,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={SITE.htmlLang} className={`${anekBangla.variable} ${hindSiliguri.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          মূল অংশে যান
        </a>
        {children}
        <Analytics />
        {/*
          Vercel Web Analytics. First-party (/_vercel/insights/*), no cookies,
          ~1 KB, loaded after hydration. Its value here is that it is served
          from our own origin, so it survives the ad blockers that silence the
          Meta pixel and GA4 for a large share of Bangladeshi traffic. It is the
          page-view baseline the "checkouts started, nothing paid" alarm needs.
          Requires Web Analytics to be enabled on the Vercel project; without
          that it fails silently. Does nothing outside Vercel.
        */}
        <VercelAnalytics />
      </body>
    </html>
  )
}
