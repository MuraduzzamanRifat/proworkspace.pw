import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCurrentAdmin } from '@/lib/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'অ্যাডমিন প্রবেশ',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  // Already signed in: skip the form.
  const admin = await getCurrentAdmin()
  if (admin) redirect('/admin')

  return (
    <main id="main" className="px-5 py-20">
      <div className="mx-auto max-w-sm">
        <h1 className="text-2xl">অ্যাডমিন প্রবেশ</h1>
        <p className="mt-2 text-sm text-[--color-muted]">
          শুধুমাত্র অনুমোদিত ব্যবহারকারীদের জন্য।
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
