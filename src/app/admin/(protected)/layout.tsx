import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentAdmin } from '@/lib/session'
import { logoutAction } from './actions'

export const metadata: Metadata = {
  title: 'অ্যাডমিন',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

/**
 * Authentication gate for every admin page.
 *
 * This layout sits inside the (protected) route group, so /admin/login is
 * deliberately outside it. Putting the guard on src/app/admin/layout.tsx would
 * wrap the login page too and redirect it to itself forever.
 *
 * The check runs on the server on every request. It is the real gate, not a
 * convenience: individual pages and actions re-check before doing anything
 * consequential.
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')

  return (
    <div className="min-h-screen">
      <header className="border-b border-[--color-line] bg-[--color-surface]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <nav aria-label="অ্যাডমিন" className="flex flex-wrap items-center gap-5 text-sm">
            <Link href="/admin" className="font-semibold">
              ড্যাশবোর্ড
            </Link>
            <Link href="/admin/orders" className="text-[--color-muted] hover:text-[--color-ink]">
              অর্ডার
            </Link>
            <Link href="/" className="text-[--color-muted] hover:text-[--color-ink]">
              সাইট দেখুন
            </Link>
          </nav>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-[--color-muted]">
              {admin.email} · {admin.role}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-[--color-line] px-3 py-1.5 hover:border-[--color-line-strong]"
              >
                লগআউট
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-5 py-8">
        {children}
      </main>
    </div>
  )
}
