import { asc, desc, eq, isNull } from 'drizzle-orm'

import { getDb } from '@/db'
import { contentSections, offers, pageVersions } from '@/db/schema'
import { SECTION_DEFINITIONS } from '@/cms/registry'
import { checkPublish, type PublishCheck } from '@/cms/publish'
import { isSectionType, validateSectionContent, type SectionType } from '@/cms/schemas'

/**
 * Read side for the admin CMS screens. Server-only; no mutations here.
 */

/** JSON with sorted keys, so equal content compares equal regardless of key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export interface BuilderSection {
  key: string
  type: SectionType
  label: string
  typeLabel: string
  inPage: boolean
  duplicable: boolean
  draftEnabled: boolean
  publishedEnabled: boolean
  draftSortOrder: number
  /** Content, enabled flag or order differ between draft and published. */
  changed: boolean
  /** Never published: exists only as a draft (e.g. a new duplicate). */
  neverPublished: boolean
  issues: string[]
  updatedAt: Date
}

export async function listSectionsForBuilder(): Promise<BuilderSection[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(contentSections)
    .where(isNull(contentSections.deletedAt))
    .orderBy(asc(contentSections.draftSortOrder))

  return rows
    .filter((r) => isSectionType(r.type))
    .map((r) => {
      const type = r.type as SectionType
      const def = SECTION_DEFINITIONS[type]
      const changed =
        stableStringify(r.draftData ?? {}) !== stableStringify(r.publishedData ?? {}) ||
        r.draftEnabled !== r.isEnabled ||
        r.draftSortOrder !== r.sortOrder
      return {
        key: r.key,
        type,
        label: r.label || def.label,
        typeLabel: def.label,
        inPage: def.inPage,
        duplicable: def.duplicable,
        draftEnabled: r.draftEnabled,
        publishedEnabled: r.isEnabled,
        draftSortOrder: r.draftSortOrder,
        changed,
        neverPublished: r.publishedData === null,
        issues: validateSectionContent(type, r.draftData ?? {}),
        updatedAt: r.updatedAt,
      }
    })
}

export interface SectionForEdit {
  key: string
  type: SectionType
  label: string
  draft: Record<string, unknown>
  published: Record<string, unknown> | null
  draftEnabled: boolean
  changed: boolean
  updatedAt: Date
  publishedAt: Date | null
}

export async function getSectionForEdit(key: string): Promise<SectionForEdit | null> {
  const db = getDb()
  const rows = await db.select().from(contentSections).where(eq(contentSections.key, key)).limit(1)
  const r = rows[0]
  if (!r || r.deletedAt || !isSectionType(r.type)) return null
  return {
    key: r.key,
    type: r.type,
    label: r.label,
    draft: r.draftData ?? {},
    published: r.publishedData,
    draftEnabled: r.draftEnabled,
    changed:
      stableStringify(r.draftData ?? {}) !== stableStringify(r.publishedData ?? {}) ||
      r.draftEnabled !== r.isEnabled,
    updatedAt: r.updatedAt,
    publishedAt: r.publishedAt,
  }
}

/** The gate result for the current draft, for the Publish bar. */
export async function checkDraftForPublish(): Promise<PublishCheck & { changedKeys: string[] }> {
  const db = getDb()
  const [rows, offerRows] = await Promise.all([
    db.select().from(contentSections).where(isNull(contentSections.deletedAt)),
    db
      .select({ code: offers.code, pricePoisha: offers.pricePoisha, isActive: offers.isActive, isDefault: offers.isDefault })
      .from(offers),
  ])

  const check = checkPublish(
    rows.map((r) => ({ key: r.key, type: r.type, enabled: r.draftEnabled, sortOrder: r.draftSortOrder, content: r.draftData ?? {} })),
    offerRows,
  )
  const changedKeys = rows
    .filter(
      (r) =>
        stableStringify(r.draftData ?? {}) !== stableStringify(r.publishedData ?? {}) ||
        r.draftEnabled !== r.isEnabled ||
        r.draftSortOrder !== r.sortOrder,
    )
    .map((r) => r.key)

  return { ...check, changedKeys }
}

export interface VersionSummary {
  version: number
  changedKeys: string[]
  restoredFrom: number | null
  publishedByEmail: string
  createdAt: Date
}

export async function listVersions(limit = 50): Promise<VersionSummary[]> {
  const db = getDb()
  const rows = await db
    .select({
      version: pageVersions.version,
      changedKeys: pageVersions.changedKeys,
      restoredFrom: pageVersions.restoredFrom,
      publishedByEmail: pageVersions.publishedByEmail,
      createdAt: pageVersions.createdAt,
    })
    .from(pageVersions)
    .orderBy(desc(pageVersions.version))
    .limit(limit)
  return rows
}

export interface VersionSnapshotSection {
  key: string
  type: string
  label: string
  enabled: boolean
  sortOrder: number
  content: Record<string, unknown>
}

export async function getVersion(version: number): Promise<(VersionSummary & { sections: VersionSnapshotSection[] }) | null> {
  const db = getDb()
  const rows = await db.select().from(pageVersions).where(eq(pageVersions.version, version)).limit(1)
  const r = rows[0]
  if (!r) return null
  const snap = r.snapshot as { sections?: VersionSnapshotSection[] }
  return {
    version: r.version,
    changedKeys: r.changedKeys,
    restoredFrom: r.restoredFrom,
    publishedByEmail: r.publishedByEmail,
    createdAt: r.createdAt,
    sections: Array.isArray(snap.sections) ? snap.sections : [],
  }
}

export async function latestVersionNumber(): Promise<number> {
  const db = getDb()
  const rows = await db.select({ version: pageVersions.version }).from(pageVersions).orderBy(desc(pageVersions.version)).limit(1)
  return rows[0]?.version ?? 0
}
