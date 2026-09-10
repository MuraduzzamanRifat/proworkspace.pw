'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import {
  recordRefundAction,
  resendDeliveryAction,
  toggleDownloadAction,
  type ActionState,
} from './actions'

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 rounded-lg border border-[--color-danger] px-3 py-2 text-sm text-[--color-danger]">
        {state.error}
      </p>
    )
  }
  if (state.ok) {
    return (
      <p role="status" className="mt-3 rounded-lg border border-[--color-success] px-3 py-2 text-sm text-[--color-success]">
        {state.ok}
      </p>
    )
  }
  return null
}

function Submit({ label, busy, tone = 'normal' }: { label: string; busy: string; tone?: 'normal' | 'danger' }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
        tone === 'danger'
          ? 'border border-[--color-danger] text-[--color-danger] hover:bg-[--color-danger]/10'
          : 'bg-[--color-cta] text-white hover:bg-[--color-cta-hover]'
      }`}
    >
      {pending ? busy : label}
    </button>
  )
}

export function ResendDelivery({ orderNumber }: { orderNumber: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resendDeliveryAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Submit label="ডেলিভারি ইমেইল আবার পাঠান" busy="পাঠানো হচ্ছে…" />
      <Feedback state={state} />
    </form>
  )
}

export function ToggleDownload({
  orderNumber,
  currentlyRevoked,
}: {
  orderNumber: string
  currentlyRevoked: boolean
}) {
  const [state, action] = useActionState<ActionState, FormData>(toggleDownloadAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <input type="hidden" name="revoke" value={currentlyRevoked ? '0' : '1'} />
      <Submit
        label={currentlyRevoked ? 'ডাউনলোড আবার চালু করুন' : 'ডাউনলোড বাতিল করুন'}
        busy="প্রক্রিয়াধীন…"
        tone={currentlyRevoked ? 'normal' : 'danger'}
      />
      <Feedback state={state} />
    </form>
  )
}

export function RecordRefund({
  orderNumber,
  maxRefundableTaka,
}: {
  orderNumber: string
  maxRefundableTaka: number
}) {
  const [state, action] = useActionState<ActionState, FormData>(recordRefundAction, {})

  if (maxRefundableTaka <= 0) {
    return <p className="text-sm text-[--color-muted]">এই অর্ডারের সম্পূর্ণ ফেরত ইতিমধ্যে রেকর্ড করা হয়েছে।</p>
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />

      {/* The wording is "record", not "refund", because this moves no money.
          The refund itself is issued in the gateway panel. */}
      <p className="text-sm text-[--color-muted]">
        গেটওয়ে প্যানেলে ফেরত দেওয়ার <strong>পরে</strong> এখানে রেকর্ড করুন। এটি নিজে কোনো টাকা ফেরত পাঠায় না।
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-[--color-muted]">
            পরিমাণ (টাকা) — সর্বোচ্চ {maxRefundableTaka}
          </span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={maxRefundableTaka}
            required
            className="w-full rounded-lg border border-[--color-line] bg-[--color-bg] px-3 py-2 text-sm"
          />
        </label>
        <label className="flex-[2]">
          <span className="mb-1 block text-xs text-[--color-muted]">কারণ</span>
          <input
            name="reason"
            type="text"
            maxLength={500}
            className="w-full rounded-lg border border-[--color-line] bg-[--color-bg] px-3 py-2 text-sm"
          />
        </label>
      </div>

      <Submit label="ফেরত রেকর্ড করুন" busy="রেকর্ড হচ্ছে…" tone="danger" />
      <Feedback state={state} />
    </form>
  )
}
