import { asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { Flash, btnCls, btnGhost, inputCls } from '@/components/admin/Flash'
import { getDb } from '@/db'
import { adminUsers } from '@/db/schema'
import { withMessage } from '@/lib/admin-guard'
import { CAPABILITY_LABELS, can, capabilitiesOf } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { createAdminUser, setAdminActive, setAdminRole } from './actions'

export const dynamic = 'force-dynamic'

const ROLES = ['super_admin', 'admin', 'marketing', 'support'] as const

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, admin] = await Promise.all([searchParams, getCurrentAdmin()])
  if (!admin || !can(admin.role, 'users.manage')) redirect(withMessage('/admin', 'error', 'ব্যবহারকারী পরিচালনার অনুমতি আপনার নেই।') as never)
  const rows = await getDb().select().from(adminUsers).orderBy(asc(adminUsers.createdAt))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">ব্যবহারকারী ও অনুমতি</h1>
        <p className="mt-1 text-sm text-[--color-muted]">ভূমিকা বদলালে পরের অনুরোধ থেকেই কার্যকর। বন্ধ করলে সব সেশন সঙ্গে সঙ্গে শেষ।</p>
      </div>
      <Flash params={params} />

      <form action={createAdminUser} className="grid gap-3 rounded-xl border border-[--color-line] bg-[--color-surface] p-5 sm:grid-cols-2">
        <p className="font-semibold sm:col-span-2">নতুন ব্যবহারকারী</p>
        <input name="email" type="email" className={inputCls} placeholder="ইমেইল" required />
        <input name="name" className={inputCls} placeholder="নাম" />
        <select name="role" className={inputCls} defaultValue="marketing">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input name="password" type="password" className={inputCls} placeholder="প্রাথমিক পাসওয়ার্ড (১২+ অক্ষর)" required minLength={12} autoComplete="new-password" />
        <div className="sm:col-span-2">
          <button type="submit" className={btnCls}>তৈরি করুন</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[--color-line]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[--color-surface] text-[--color-muted]">
            <tr>
              <th className="px-4 py-3 font-medium">ব্যবহারকারী</th>
              <th className="px-4 py-3 font-medium">ভূমিকা</th>
              <th className="px-4 py-3 font-medium">অবস্থা</th>
              <th className="px-4 py-3 font-medium">শেষ প্রবেশ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-[--color-line] align-top">
                <td className="px-4 py-3">
                  <span className="block">{u.name || '—'}</span>
                  <span className="text-xs text-[--color-muted]">{u.email}</span>
                  {u.id === admin.userId && <span className="ml-1 text-xs text-[--color-accent]">(আপনি)</span>}
                </td>
                <td className="px-4 py-3">
                  <form action={setAdminRole} className="flex gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="role" defaultValue={u.role} className={`${inputCls} py-1`} disabled={u.id === admin.userId}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    {u.id !== admin.userId && <button type="submit" className={btnGhost}>বদলান</button>}
                  </form>
                </td>
                <td className="px-4 py-3">
                  {u.isActive ? 'সক্রিয়' : 'বন্ধ'}
                  {u.lockedUntil && u.lockedUntil.getTime() > Date.now() && <span className="ml-1 text-xs text-[--color-warning]">(লক)</span>}
                </td>
                <td className="px-4 py-3 text-xs text-[--color-muted]">{u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== admin.userId && (
                    <form action={setAdminActive}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="active" value={u.isActive ? '0' : '1'} />
                      <button type="submit" className={`${btnGhost} ${u.isActive ? 'text-[--color-danger]' : ''}`}>
                        {u.isActive ? 'বন্ধ করুন' : 'সক্রিয় করুন'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5 text-sm">
        <h2 className="mb-3 font-semibold">ভূমিকা অনুযায়ী অনুমতি</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r}>
              <p className="font-mono text-xs text-[--color-accent]">{r}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-[--color-muted]">
                {capabilitiesOf(r).map((c) => (
                  <li key={c}>✓ {CAPABILITY_LABELS[c]}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
