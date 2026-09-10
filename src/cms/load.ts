import { asc, isNull } from 'drizzle-orm'

import { getDb } from '@/db'
import { contentSections } from '@/db/schema'
import { DEFAULT_PAGE } from '@/cms/registry'
import { isSectionType, parseSectionContent, type SectionContent, type SectionType } from '@/cms/schemas'
import { log } from '@/lib/logger'

/**
 * Loading a page for rendering.
 *
 * Two functions, one shape. `loadPublishedPage` is what customers see and is
 * what the landing route renders under ISR; `loadDraftPage` is what the
 * preview route renders for a signed-in admin. Both parse every section's
 * JSON through its schema, so bad data degrades to defaults and is logged
 * rather than throwing in the middle of a customer's request.
 *
 * Failure safety: if the database is unreachable, the page falls back to the
 * built-in defaults (the same content the seed wrote). The customer gets a
 * complete page; the operator gets an error log. The ISR cache in front of
 * this holds the last successful HTML for a further minute regardless.
 */

export interface RenderedSection<T extends SectionType = SectionType> {
  key: string
  type: T
  label: string
  enabled: boolean
  sortOrder: number
  content: SectionContent<T>
}

export interface RenderedPage {
  /** In-page sections, ordered, enabled only. */
  sections: RenderedSection[]
  /** Every section including disabled and globals, for the builder/preview. */
  all: RenderedSection[]
  footer: SectionContent<'footer'> | null
  seo: SectionContent<'seo'> | null
  source: 'database' | 'defaults'
  /** Parse problems found while loading, keyed by section. Empty in health. */
  issues: Record<string, string[]>
}

type Mode = 'published' | 'draft'

function fromDefaults(): RenderedPage {
  const all: RenderedSection[] = DEFAULT_PAGE.map((s) => ({
    key: s.key,
    type: s.type,
    label: s.label,
    enabled: s.enabled,
    sortOrder: s.sortOrder,
    content: parseSectionContent(s.type, s.content()).content,
  }))
  return assemble(all, 'defaults', {})
}

function assemble(all: RenderedSection[], source: RenderedPage['source'], issues: Record<string, string[]>): RenderedPage {
  const sorted = [...all].sort((a, b) => a.sortOrder - b.sortOrder)
  const footer = sorted.find((s) => s.type === 'footer' && s.enabled)
  const seo = sorted.find((s) => s.type === 'seo')
  const inPage = sorted.filter((s) => s.enabled && s.type !== 'footer' && s.type !== 'seo')
  return {
    sections: inPage,
    all: sorted,
    footer: footer ? (footer.content as SectionContent<'footer'>) : null,
    seo: seo ? (seo.content as SectionContent<'seo'>) : null,
    source,
    issues,
  }
}

async function load(mode: Mode): Promise<RenderedPage> {
  if (!process.env.DATABASE_URL) return fromDefaults()

  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(contentSections)
      .where(isNull(contentSections.deletedAt))
      .orderBy(asc(contentSections.sortOrder))

    if (rows.length === 0) {
      log.warn('cms.no_sections_seeded', { mode })
      return fromDefaults()
    }

    const issues: Record<string, string[]> = {}
    const all: RenderedSection[] = []

    for (const row of rows) {
      if (!isSectionType(row.type)) {
        issues[row.key] = [`unknown section type "${row.type}"`]
        continue
      }
      const data = mode === 'published' ? row.publishedData : row.draftData
      // A section that has never been published renders nothing publicly.
      if (mode === 'published' && data === null) continue

      const parsed = parseSectionContent(row.type, data)
      if (parsed.issues.length > 0) issues[row.key] = parsed.issues

      all.push({
        key: row.key,
        type: row.type,
        label: row.label,
        enabled: mode === 'published' ? row.isEnabled : row.draftEnabled,
        sortOrder: mode === 'published' ? row.sortOrder : row.draftSortOrder,
        content: parsed.content,
      })
    }

    if (Object.keys(issues).length > 0) log.warn('cms.parse_issues', { mode, issues })
    return assemble(all, 'database', issues)
  } catch (err) {
    log.error('cms.load_failed', { mode, err })
    return fromDefaults()
  }
}

export function loadPublishedPage(): Promise<RenderedPage> {
  return load('published')
}

export function loadDraftPage(): Promise<RenderedPage> {
  return load('draft')
}
