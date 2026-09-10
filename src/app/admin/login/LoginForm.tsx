'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { loginAction, type LoginFormState } from './actions'

export function LoginForm() {
  const [state, formAction] = useActionState<LoginFormState, FormData>(loginAction, {})

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold">
          ইমেইল
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-3"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold">
          পাসওয়ার্ড
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-[--color-line] bg-[--color-surface] px-4 py-3"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-[--color-danger] px-4 py-3 text-sm text-[--color-danger]"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  )
}

/**
 * Split out because useFormStatus only reports the pending state of the form
 * it is rendered inside, not of a sibling.
 */
function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-[--color-cta] px-6 py-3 font-semibold text-white hover:bg-[--color-cta-hover] disabled:opacity-60"
    >
      {pending ? 'যাচাই করা হচ্ছে…' : 'প্রবেশ করুন'}
    </button>
  )
}
