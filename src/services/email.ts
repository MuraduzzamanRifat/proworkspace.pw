import { Resend } from 'resend'

import { emailConfigured, serverEnv } from '@/config/env'
import { formatBdt } from '@/domain/money'
import { poisha } from '@/domain/money'
import { log } from '@/lib/logger'

/**
 * Transactional email.
 *
 * Every function here returns a result object and never throws. A mail
 * provider outage must not turn a successful payment into a failed request:
 * the money is real whether or not the receipt sends. Failures are logged and
 * surfaced in the admin so they can be resent by hand.
 */

export interface SendResult {
  sent: boolean
  /** Present when sent === false. */
  reason?: string
  providerId?: string
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function send(args: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<SendResult> {
  if (!emailConfigured()) {
    // Development and misconfigured production both land here. Logging the
    // fact loudly is better than silently pretending a receipt went out.
    log.warn('email.not_configured', { to: args.to, subject: args.subject })
    return { sent: false, reason: 'RESEND_API_KEY is not set' }
  }

  try {
    const env = serverEnv()
    const resend = new Resend(env.RESEND_API_KEY)
    const result = await resend.emails.send({
      from: env.MAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    })

    if (result.error) {
      log.error('email.provider_error', { to: args.to, err: result.error.message })
      return { sent: false, reason: result.error.message }
    }

    log.info('email.sent', { to: args.to, subject: args.subject, id: result.data?.id })
    return { sent: true, providerId: result.data?.id }
  } catch (err) {
    log.error('email.threw', { to: args.to, err })
    return { sent: false, reason: err instanceof Error ? err.message : 'unknown' }
  }
}

const BASE_STYLE =
  'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Bengali",sans-serif;' +
  'line-height:1.7;color:#101216;background:#ffffff;'

export interface DeliveryEmailArgs {
  to: string
  customerName: string
  orderNumber: string
  productTitle: string
  totalPoisha: number
  downloadUrl: string
  deliverables: readonly string[]
}

/** The receipt plus the thing they actually bought. */
export async function sendDeliveryEmail(args: DeliveryEmailArgs): Promise<SendResult> {
  const name = escapeHtml(args.customerName || 'বন্ধু')
  const title = escapeHtml(args.productTitle)
  const orderNumber = escapeHtml(args.orderNumber)
  const url = args.downloadUrl
  const amount = formatBdt(poisha(args.totalPoisha))

  const items = args.deliverables
    .map((d) => `<li style="margin:4px 0;">${escapeHtml(d)}</li>`)
    .join('')

  const html = `<div style="${BASE_STYLE}max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">ধন্যবাদ, ${name}!</h1>
  <p style="margin:0 0 16px;">আপনার অর্ডার সম্পন্ন হয়েছে। নিচের বোতাম থেকে বইটি ডাউনলোড করুন।</p>
  <p style="margin:24px 0;">
    <a href="${url}" style="background:#4F46E5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;display:inline-block;font-weight:600;">বই ডাউনলোড করুন</a>
  </p>
  <p style="margin:0 0 8px;font-size:14px;color:#5A6478;">বোতাম কাজ না করলে এই লিংকটি ব্রাউজারে পেস্ট করুন:<br>
    <span style="word-break:break-all;">${escapeHtml(url)}</span></p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;">
  <p style="margin:0 0 8px;"><strong>${title}</strong></p>
  <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;">${items}</ul>
  <p style="margin:0;font-size:14px;color:#5A6478;">অর্ডার নম্বর: <strong>${orderNumber}</strong><br>পরিশোধিত: <strong>${escapeHtml(amount)}</strong></p>
  <p style="margin:24px 0 0;font-size:13px;color:#5A6478;">এই লিংকটি আপনার ব্যক্তিগত। ভবিষ্যতের সব সংস্করণ বিনামূল্যে পাবেন।</p>
</div>`

  const text = [
    `ধন্যবাদ, ${args.customerName || 'বন্ধু'}!`,
    '',
    'আপনার অর্ডার সম্পন্ন হয়েছে। এই লিংক থেকে বইটি ডাউনলোড করুন:',
    url,
    '',
    args.productTitle,
    ...args.deliverables.map((d) => `- ${d}`),
    '',
    `অর্ডার নম্বর: ${args.orderNumber}`,
    `পরিশোধিত: ${amount}`,
  ].join('\n')

  return send({
    to: args.to,
    subject: `আপনার বই প্রস্তুত — ${args.productTitle}`,
    html,
    text,
  })
}

/** Fire-and-forget alert so the owner sees sales without opening the admin. */
export async function sendAdminOrderAlert(args: {
  orderNumber: string
  email: string
  totalPoisha: number
  paymentMethod: string
}): Promise<SendResult> {
  const to = serverEnv().ADMIN_ALERT_EMAIL
  if (!to) return { sent: false, reason: 'ADMIN_ALERT_EMAIL is not set' }

  const amount = formatBdt(poisha(args.totalPoisha), { bengali: false })
  const html = `<div style="${BASE_STYLE}padding:16px;">
  <h2 style="font-size:16px;margin:0 0 12px;">New order ${escapeHtml(args.orderNumber)}</h2>
  <p style="margin:0;">Amount: <strong>${escapeHtml(amount)}</strong><br>
  Customer: ${escapeHtml(args.email)}<br>
  Method: ${escapeHtml(args.paymentMethod || 'unknown')}</p>
</div>`

  return send({
    to,
    subject: `New order ${args.orderNumber} — ${amount}`,
    html,
    text: `New order ${args.orderNumber}\nAmount: ${amount}\nCustomer: ${args.email}\nMethod: ${args.paymentMethod}`,
  })
}

/** Sent when a payment reconciles to the wrong amount. Needs a human. */
export async function sendPaymentMismatchAlert(args: {
  orderNumber: string
  expectedPoisha: number
  receivedPoisha: number
  invoiceId: string
}): Promise<SendResult> {
  const to = serverEnv().ADMIN_ALERT_EMAIL
  if (!to) return { sent: false, reason: 'ADMIN_ALERT_EMAIL is not set' }

  const expected = formatBdt(poisha(args.expectedPoisha), { bengali: false })
  const received = formatBdt(poisha(args.receivedPoisha), { bengali: false })

  const text = [
    `PAYMENT AMOUNT MISMATCH on order ${args.orderNumber}`,
    `Expected: ${expected}`,
    `Received: ${received}`,
    `Gateway invoice: ${args.invoiceId}`,
    '',
    'The order was NOT fulfilled automatically. Review it in the admin before releasing the download.',
  ].join('\n')

  return send({
    to,
    subject: `ACTION NEEDED: amount mismatch on ${args.orderNumber}`,
    html: `<pre style="${BASE_STYLE}">${escapeHtml(text)}</pre>`,
    text,
  })
}
