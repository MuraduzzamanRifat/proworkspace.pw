import { and, desc, ilike, or, type SQL } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { inputCls } from '@/components/admin/Flash'
import { withMessage } from '@/lib/admin-guard'
import { getDb } from '@/db'
import { auditLogs } from '@/db/schema'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, admin] = await Promise.all([searchParams, getCurrentAdmin()])
  if (!admin || !can(admin.role, 'audit.view')) redirect(withMessage('/admin', 'error', 'কার্যবিবরণী দেখার অনুমতি আপনার নেই।') as never)
  const raw = params['q']
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''

  const conds: SQL[] = []
  if (q) {
    const like = `%${q}%`
    const m = or(ilike(auditLogs.action, like), ilike(auditLogs.actorEmail, like), ilike(auditLogs.entityId, like), ilike(auditLogs.entityType, like))
    if (m) conds.push(m)
  }
  const rows = await getDb()
    .select()
    .from(auditLogs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(200)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">কার্যবিবরণী</h1>
        <p className="mt-1 text-sm text-[--color-muted]">কে, কখন, কী বদলেছে — আগের ও পরের মান সহ। শেষ ২০০টি।</p>
      </div>
      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="ক্রিয়া, ইমেইল বা আইডি" className={`${inputCls} max-w-sm`} aria-label="খুঁজুন" />
        <button type="submit" className="rounded-lg bg-[--color-cta] px-4 py-2 text-sm font-semibold text-white">খুঁজুন</button>
      </form>
      <ol className="space-y-2">
        {rows.map((a) => (
          <li key={a.id} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-[--color-accent]">{a.action}</span>
              <span className="text-[--color-muted]">{a.actorEmail || 'system'}</span>
              <span className="text-xs text-[--color-muted]">{a.entityType} {a.entityId}</span>
              <span className="ml-auto text-xs text-[--color-muted]">{a.createdAt.toISOString().slice(0, 19).replace('T', ' ')}</span>
            </p>
            {(a.before || a.after) && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[--color-muted]">আগে / পরে</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <pre className="overflow-x-auto rounded-lg bg-[--color-bg] p-2 text-xs">{a.before ? JSON.stringify(a.before, null, 1) : '—'}</pre>
                  <pre className="overflow-x-auto rounded-lg bg-[--color-bg] p-2 text-xs">{a.after ? JSON.stringify(a.after, null, 1) : '—'}</pre>
                </div>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
