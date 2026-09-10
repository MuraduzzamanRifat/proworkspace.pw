import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getSectionForEdit } from '@/cms/admin-read'
import { SECTION_DEFINITIONS } from '@/cms/registry'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { SectionEditor } from '../SectionEditor'

export const dynamic = 'force-dynamic'

export default async function SectionEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const [admin, section] = await Promise.all([getCurrentAdmin(), getSectionForEdit(key)])
  if (!section || !admin) notFound()

  const def = SECTION_DEFINITIONS[section.type]
  const canEdit = can(admin.role, 'content.edit')

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/landing" className="text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← ল্যান্ডিং পেজ
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl">{section.label || def.label}</h1>
          <p className="text-xs text-[--color-muted]">
            {def.label}
            {section.published === null ? ' · কখনো প্রকাশিত হয়নি' : section.changed ? ' · অপ্রকাশিত পরিবর্তন আছে' : ' · প্রকাশিত সংস্করণের সঙ্গে মিলে আছে'}
          </p>
        </div>
        <p className="mt-1 text-sm text-[--color-muted]">{def.description}</p>
      </div>

      <SectionEditor
        sectionKey={section.key}
        type={section.type}
        fields={def.fields}
        initial={section.draft}
        canEdit={canEdit}
        hasPublished={section.published !== null}
        initialEnabled={section.draftEnabled}
        isHero={section.type === 'hero'}
      />
    </div>
  )
}
