'use client'

import { useEffect, useRef, useState } from 'react'

import { collectAttribution, newIdempotencyKey, recordTouch } from '@/lib/attribution'

/**
 * The only client component in the funnel.
 *
 * Double-submit protection is belt and braces:
 *   - the button is disabled while a request is in flight, and
 *   - the idempotency key is generated ONCE per mount and reused on retry,
 *     so even if the disable is defeated the server returns the same order.
 *
 * The form posts an offer code, never a price.
 */

interface Props {
  offerCode: string
  priceLabel: string
  paymentMethods: readonly string[]
  /** Settings → "চেকআউটে কুপন কোডের ঘর". */
  showCoupon?: boolean
}

interface CouponState {
  code: string
  applied: { code: string; discount: string; total: string } | null
  error: string | null
  checking: boolean
}

interface FieldErrors {
  name?: string
  email?: string
  form?: string
}

export function CheckoutForm({ offerCode, priceLabel, paymentMethods, showCoupon = false }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [coupon, setCoupon] = useState<CouponState>({ code: '', applied: null, error: null, checking: false })

  /**
   * Preview only. The server recomputes the price from database rows when
   * the order is created; this call exists so a wrong code is shown BEFORE
   * the customer is sent to pay full price.
   */
  async function applyCoupon() {
    const code = coupon.code.trim().toUpperCase()
    if (!code) return
    setCoupon((c) => ({ ...c, checking: true, error: null, applied: null }))
    try {
      const r = await fetch(`/api/coupon?code=${encodeURIComponent(code)}&offer=${encodeURIComponent(offerCode)}`)
      const j = (await r.json()) as { ok: boolean; error?: string; code?: string; discount?: string; total?: string }
      if (j.ok && j.code) setCoupon({ code, applied: { code: j.code, discount: j.discount ?? '', total: j.total ?? '' }, error: null, checking: false })
      else setCoupon((c) => ({ ...c, applied: null, error: j.error ?? 'কোডটি প্রযোজ্য নয়।', checking: false }))
    } catch {
      setCoupon((c) => ({ ...c, applied: null, error: 'কোড যাচাই করা যায়নি।', checking: false }))
    }
  }
  const idempotencyKey = useRef<string>('')

  if (idempotencyKey.current === '') {
    idempotencyKey.current = newIdempotencyKey()
  }

  useEffect(() => {
    recordTouch()
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const phone = String(data.get('phone') ?? '').trim()

    const nextErrors: FieldErrors = {}
    if (name === '') nextErrors.name = 'আপনার নাম লিখুন'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'সঠিক ইমেইল ঠিকানা দিন'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerCode,
          name,
          email,
          phone,
          idempotencyKey: idempotencyKey.current,
          couponCode: showCoupon && coupon.applied ? coupon.applied.code : null,
          attribution: collectAttribution(),
        }),
      })

      const result = (await response.json()) as
        | { ok: true; paymentUrl: string }
        | { ok: false; error: string; field?: string }

      if (!result.ok) {
        setErrors({ form: result.error })
        setSubmitting(false)
        return
      }

      // Deliberately not resetting `submitting`: the page is navigating away
      // and re-enabling the button would invite a second click during unload.
      window.location.assign(result.paymentUrl)
    } catch {
      setErrors({ form: 'নেটওয়ার্ক সমস্যা। ইন্টারনেট যাচাই করে আবার চেষ্টা করুন।' })
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field
        id="name"
        name="name"
        label="নাম"
        autoComplete="name"
        required
        error={errors.name}
      />
      <Field
        id="email"
        name="email"
        label="ইমেইল"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={errors.email}
        hint="বইটি এই ঠিকানাতেই পাঠানো হবে।"
      />
      <Field
        id="phone"
        name="phone"
        label="মোবাইল নম্বর"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="ঐচ্ছিক — সহায়তার প্রয়োজনে।"
      />

      {showCoupon && (
        <div>
          <label htmlFor="coupon" className="mb-2 block text-sm font-semibold text-[--color-ink]">
            কুপন কোড
          </label>
          <div className="flex gap-2">
            <input
              id="coupon"
              name="coupon"
              value={coupon.code}
              autoComplete="off"
              onChange={(e) => setCoupon({ code: e.target.value, applied: null, error: null, checking: false })}
              className="w-full rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-3 uppercase text-[--color-ink]"
            />
            <button
              type="button"
              onClick={applyCoupon}
              disabled={coupon.checking || coupon.code.trim() === ''}
              className="shrink-0 rounded-xl border border-[--color-line-strong] px-4 py-3 text-sm font-semibold hover:border-[--color-accent] disabled:opacity-50"
            >
              {coupon.checking ? 'যাচাই…' : 'প্রয়োগ'}
            </button>
          </div>
          {coupon.applied && (
            <p role="status" className="mt-1.5 text-sm text-[--color-success]">
              {coupon.applied.code} প্রযোজ্য — ছাড় {coupon.applied.discount}, মোট {coupon.applied.total}
            </p>
          )}
          {coupon.error && (
            <p role="alert" className="mt-1.5 text-sm text-[--color-danger]">
              {coupon.error}
            </p>
          )}
        </div>
      )}

      {errors.form && (
        <p role="alert" className="rounded-lg border border-[--color-danger] px-4 py-3 text-sm text-[--color-danger]">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[--color-cta] px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-[--color-cta-hover] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'অপেক্ষা করুন…' : `${showCoupon && coupon.applied ? coupon.applied.total : priceLabel} — পেমেন্ট করুন`}
      </button>

      {paymentMethods.length > 0 && (
        <p className="text-center text-sm text-[--color-muted]">
          {paymentMethods.join(' · ')}
        </p>
      )}
      <p className="text-center text-xs text-[--color-muted]">
        পেমেন্ট সম্পন্ন হলে সঙ্গে সঙ্গে ডাউনলোড লিংক পাবেন।
      </p>
    </form>
  )
}

function Field({
  id,
  name,
  label,
  error,
  hint,
  ...rest
}: {
  id: string
  name: string
  label: string
  error?: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[--color-ink]">
        {label}
        {rest.required && <span aria-hidden> *</span>}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="w-full rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-3 text-[--color-ink] placeholder:text-[--color-line-strong]"
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-[--color-muted]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-[--color-danger]">
          {error}
        </p>
      )}
    </div>
  )
}
