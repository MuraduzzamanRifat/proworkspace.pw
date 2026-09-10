'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { changePasswordAction, type PasswordFormState } from './actions'

export function PasswordForm() {
  const [state, action] = useActionState<PasswordFormState, FormData>(changePasswordAction, {})

  return (
    <form action={action} className="max-w-md space-y-5">
      <Field id="current" name="current" label="বর্তমান পাসওয়ার্ড" autoComplete="current-password" />
      <Field
        id="next"
        name="next"
        label="নতুন পাসওয়ার্ড"
        autoComplete="new-password"
        hint="অন্তত ১২ অক্ষর। একটি দীর্ঘ বাক্যাংশ সবচেয়ে ভালো।"
      />
      <Field id="confirm" name="confirm" label="নতুন পাসওয়ার্ড আবার" autoComplete="new-password" />

      {state.error && (
        <p role="alert" className="rounded-lg border border-[--color-danger] px-4 py-3 text-sm text-[--color-danger]">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-lg border border-[--color-success] px-4 py-3 text-sm text-[--color-success]">
          {state.ok}
        </p>
      )}

      <Submit />
    </form>
  )
}

function Field({
  id,
  name,
  label,
  hint,
  autoComplete,
}: {
  id: string
  name: string
  label: string
  hint?: string
  autoComplete: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        required
        minLength={id === 'current' ? 1 : 12}
        maxLength={256}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-3"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-[--color-muted]">
          {hint}
        </p>
      )}
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-[--color-cta] px-6 py-3 font-semibold text-white hover:bg-[--color-cta-hover] disabled:opacity-60"
    >
      {pending ? 'বদলানো হচ্ছে…' : 'পাসওয়ার্ড বদলান'}
    </button>
  )
}
