import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getVersion, latestVersionNumber } from '@/cms/admin-read'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { RestoreButton } from '../RestoreButton'

export const dynamic = 'force-dynamic'

/** Read-only view of one snapshot: what was live, section by section. */
export default async function VersionDetailPage({ params }: { params: Promise<{ version: string }> }) {
  const { version: raw } = await params
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) notFound()

  const [admin, v, latest] = await Promise.all([getCurrentAdmin(), getVersion(n), latestVersionNumber()])
  if (!v || !admin) notFound()
  const canRestore = can(admin.role, 'content.publish')

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/landing/versions" className="text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← সংস্করণ ইতিহাস
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-mono text-2xl">v{v.version}</h1>
          {canRestore && v.version !== latest && <RestoreButton version={v.version} />}
        </div>
        <p className="mt-1 text-sm text-[--color-muted]">
          {v.publishedByEmail} · {v.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
          {v.version === latest && ' · এটিই লাইভ'}
        </p>
      </div>

      <ol className="space-y-2">
        {v.sections
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => (
            <li key={s.key} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.label || s.key}</span>
                <span className="text-xs text-[--color-muted]">{s.type}</span>
                {!s.enabled && <span className="rounded-full border border-[--color-line] px-2 py-0.5 text-xs text-[--color-muted]">বন্ধ</span>}
                {v.changedKeys.includes(s.key) && <span className="rounded-full border border-[--color-warning] px-2 py-0.5 text-xs text-[--color-warning]">এই সংস্করণে বদলেছে</span>}
              </p>
              <p className="mt-2 line-clamp-2 text-xs text-[--color-muted]">{summarise(s.content)}</p>
            </li>
          ))}
      </ol>
    </div>
  )
}

/** First few string values, so a version is recognisable without opening JSON. */
function summarise(content: Record<string, unknown>): string {
  const parts: string[] = []
  for (const v of Object.values(content)) {
    if (typeof v === 'string' && v.trim()) parts.push(v.trim())
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string' && x.trim()) parts.push(x.trim())
    if (parts.join(' ').length > 220) break
  }
  return parts.join(' · ').slice(0, 240)
}
