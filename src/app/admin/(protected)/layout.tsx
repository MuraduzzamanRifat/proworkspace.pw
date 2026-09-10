import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { clientEnv } from '@/config/env'
import { can, type Capability } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { logoutAction } from './actions'

export const metadata: Metadata = {
  title: 'অ্যাডমিন',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

/**
 * Authentication gate for every admin page, and the navigation.
 *
 * The (protected) route group keeps /admin/login outside this layout, so the
 * guard cannot redirect the login page to itself. Navigation items are
 * filtered by capability, but that is presentation only: every page and
 * every action re-checks on the server.
 */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')

  const items: Array<{ href: '/admin' | '/admin/landing' | '/admin/products' | '/admin/offers' | '/admin/orders' | '/admin/customers' | '/admin/coupons' | '/admin/media' | '/admin/settings' | '/admin/users' | '/admin/audit' | '/admin/account'; label: string; cap?: Capability }> = [
    { href: '/admin', label: 'ড্যাশবোর্ড' },
    { href: '/admin/landing', label: 'ল্যান্ডিং পেজ', cap: 'content.edit' },
    { href: '/admin/products', label: 'পণ্য', cap: 'commerce.manage' },
    { href: '/admin/offers', label: 'অফার', cap: 'commerce.manage' },
    { href: '/admin/orders', label: 'অর্ডার', cap: 'orders.view' },
    { href: '/admin/customers', label: 'ক্রেতা', cap: 'customers.view' },
    { href: '/admin/coupons', label: 'কুপন', cap: 'commerce.manage' },
    { href: '/admin/media', label: 'মিডিয়া', cap: 'media.manage' },
    { href: '/admin/settings', label: 'সেটিংস', cap: 'settings.manage' },
    { href: '/admin/users', label: 'ব্যবহারকারী', cap: 'users.manage' },
    { href: '/admin/audit', label: 'কার্যবিবরণী', cap: 'audit.view' },
    { href: '/admin/account', label: 'অ্যাকাউন্ট' },
  ]
  const visible = items.filter((i) => !i.cap || can(admin.role, i.cap))

  return (
    <div className="min-h-screen">
      <header className="border-b border-[--color-line] bg-[--color-surface]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <nav aria-label="অ্যাডমিন" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {visible.map((i) => (
              <Link key={i.href} href={i.href} className={i.href === '/admin' ? 'font-semibold' : 'text-[--color-muted] hover:text-[--color-ink]'}>
                {i.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <a href={clientEnv.NEXT_PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[--color-accent] px-3 py-1.5 text-[--color-accent] hover:bg-[--color-accent]/10">
              লাইভ পেজ ↗
            </a>
            <span className="hidden text-xs text-[--color-muted] sm:inline">
              {admin.email} · {admin.role}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="rounded-lg border border-[--color-line] px-3 py-1.5 hover:border-[--color-line-strong]">
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
