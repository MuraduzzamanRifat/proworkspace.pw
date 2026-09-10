'use client'

import Script from 'next/script'
import { useEffect } from 'react'

import { clientEnv } from '@/config/env'

/**
 * Browser-side tracking.
 *
 * Three rules this file exists to enforce:
 *
 * 1. Nothing here is render-blocking. `afterInteractive` means the pixel loads
 *    after the page is usable, so a slow tracking host cannot delay content.
 * 2. Nothing here can break checkout. Every call is wrapped, and the funnel
 *    works identically with an ad blocker installed or with no pixel ID set.
 * 3. Purchase events carry an `eventID` that matches the one the server sends
 *    through the Conversions API, so Meta counts one sale, not two.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

const PIXEL_ID = clientEnv.NEXT_PUBLIC_META_PIXEL_ID
const GA4_ID = clientEnv.NEXT_PUBLIC_GA4_MEASUREMENT_ID

export function Analytics() {
  if (!PIXEL_ID && !GA4_ID) return null

  return (
    <>
      {PIXEL_ID && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
          </Script>

          {/*
            Fallback for visitors with JavaScript disabled or blocked.
            Worth having here specifically because the landing page is
            server-rendered: it displays and converts fine without JS, so
            those visits are real traffic rather than a rounding error.
            Meta deduplicates this against the script-based PageView.
          */}
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${GA4_ID}');`}
          </Script>
        </>
      )}
    </>
  )
}

/** Fires exactly one deduplicated Purchase event. */
export function PurchaseEvent({
  eventId,
  valueBdt,
  orderNumber,
}: {
  eventId: string
  valueBdt: number
  orderNumber: string
}) {
  useEffect(() => {
    try {
      window.fbq?.('track', 'Purchase', { value: valueBdt, currency: 'BDT' }, { eventID: eventId })
    } catch {
      /* tracking must never surface to the customer */
    }
    try {
      window.dataLayer?.push({
        event: 'purchase',
        transaction_id: orderNumber,
        value: valueBdt,
        currency: 'BDT',
      })
    } catch {
      /* same */
    }
  }, [eventId, valueBdt, orderNumber])

  return null
}
