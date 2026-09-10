'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { clientIp } from '@/lib/rate-limit'
import { login } from '@/services/admin-auth'

export interface LoginFormState {
  error?: string
}

/**
 * Login server action.
 *
 * Credentials are read from FormData on the server. They are never placed in a
 * URL, never logged, and never returned to the client in any form.
 */
export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  if (email.trim() === '' || password === '') {
    return { error: 'ইমেইল ও পাসওয়ার্ড দুটোই দিন।' }
  }

  const headerList = await headers()
  const result = await login({
    email,
    password,
    ip: clientIp(headerList),
    userAgent: headerList.get('user-agent') ?? '',
  })

  if (!result.ok) {
    return { error: result.error ?? 'প্রবেশ করা যায়নি।' }
  }

  // Outside the failure path so the redirect signal is not caught above.
  redirect('/admin')
}
