import Link from 'next/link'

import { checkDraftForPublish, latestVersionNumber, listSectionsForBuilder } from '@/cms/admin-read'
import { clientEnv } from '@/config/env'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { PublishBar } from './PublishBar'
import { RowActions } from './RowActions'

export const dynamic = 'force-dynamic'

/**
 * Page builder: every section in draft order, what has changed, what blocks
 * publishing, and the Publish button. This is the one screen a non-developer
 * needs to run the landing page.
 */
export default async function LandingBuilderPage() {
  const [admin, sections, check, latest] = await Promise.all([
    getCurrentAdmin(),
    listSectionsForBuilder(),
    checkDraftForPublish(),
    latestVersionNumber(),
  ])
  const role = admin?.role ?? 'support'
  const canEdit = can(role, 'content.edit')
  const canPublish = can(role, 'content.publish')

  const inPage = sections.filter((s) => s.inPage)
  const globals = sections.filter((s) => !s.inPage)
  const issuesByKey = new Map<string, string[]>()
  for (const e of check.errors) issuesByKey.set(e.key, [...(issuesByKey.get(e.key) ?? []), e.message])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">ল্যান্ডিং পেজ</h1>
          <p className="mt-1 text-sm text-[--color-muted]">
            প্রকাশিত সংস্করণ: <span className="font-mono">v{latest}</span>
            {check.changedKeys.length > 0 && (
              <>
                {' · '}
                <span className="text-[--color-warning]">{check.changedKeys.length}টি সেকশনে অপ্রকাশিত পরিবর্তন</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/preview" target="_blank" className="rounded-lg border border-[--color-line] px-3 py-1.5 hover:border-[--color-line-strong]">
            খসড়া প্রিভিউ ↗
          </Link>
          <a href={clientEnv.NEXT_PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[--color-line] px-3 py-1.5 hover:border-[--color-line-strong]">
            লাইভ পেজ ↗
          </a>
          <Link href="/admin/landing/versions" className="rounded-lg border border-[--color-line] px-3 py-1.5 hover:border-[--color-line-strong]">
            সংস্করণ ইতিহাস
          </Link>
        </div>
      </div>

      <PublishBar
        changedKeys={check.changedKeys}
        errors={check.errors.map((e) => `${labelFor(sections, e.key)}: ${e.message}`)}
        warnings={check.warnings.map((w) => `${labelFor(sections, w.key)}: ${w.message}`)}
        canPublish={canPublish}
      />

      <section aria-labelledby="page-sections">
        <h2 id="page-sections" className="mb-3 text-lg font-semibold">
          পেজের সেকশন (উপর থেকে নিচে)
        </h2>
        <ol className="space-y-2">
          {inPage.map((s, i) => (
            <li key={s.key} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[--color-muted]">{i + 1}.</span>
                    <Link href={`/admin/landing/${s.key}`} className="font-semibold hover:underline">
                      {s.label}
                    </Link>
                    <span className="text-xs text-[--color-muted]">{s.typeLabel}</span>
                    {!s.draftEnabled && <Badge tone="muted">বন্ধ</Badge>}
                    {s.changed && <Badge tone="warning">অপ্রকাশিত পরিবর্তন</Badge>}
                    {s.neverPublished && <Badge tone="accent">নতুন</Badge>}
                    {(issuesByKey.get(s.key) ?? s.issues).length > 0 && <Badge tone="danger">সমস্যা</Badge>}
                  </p>
                  {(issuesByKey.get(s.key) ?? s.issues).slice(0, 3).map((m) => (
                    <p key={m} className="mt-1 text-xs text-[--color-danger]">
                      {m}
                    </p>
                  ))}
                </div>
                <RowActions
                  sectionKey={s.key}
                  enabled={s.draftEnabled}
                  isFirst={i === 0}
                  isLast={i === inPage.length - 1}
                  duplicable={s.duplicable}
                  changed={s.changed}
                  neverPublished={s.neverPublished}
                  isHero={s.type === 'hero'}
                  canEdit={canEdit}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="global-sections">
        <h2 id="global-sections" className="mb-3 text-lg font-semibold">
          সাইট-ব্যাপী
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {globals.map((s) => (
            <li key={s.key} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4">
              <p className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/landing/${s.key}`} className="font-semibold hover:underline">
                  {s.label}
                </Link>
                {s.changed && <Badge tone="warning">অপ্রকাশিত পরিবর্তন</Badge>}
                {(issuesByKey.get(s.key) ?? s.issues).length > 0 && <Badge tone="danger">সমস্যা</Badge>}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function labelFor(sections: Array<{ key: string; label: string }>, key: string): string {
  return sections.find((s) => s.key === key)?.label ?? key
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'muted' | 'warning' | 'accent' | 'danger' }) {
  const cls = {
    muted: 'border-[--color-line] text-[--color-muted]',
    warning: 'border-[--color-warning] text-[--color-warning]',
    accent: 'border-[--color-accent] text-[--color-accent]',
    danger: 'border-[--color-danger] text-[--color-danger]',
  }[tone]
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>
}
