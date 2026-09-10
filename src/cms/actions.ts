'use server'

import { asc, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

import { checkDraftForPublish, latestVersionNumber, stableStringify } from '@/cms/admin-read'
import { SECTION_DEFINITIONS } from '@/cms/registry'
import { SECTION_SCHEMAS, isSectionType, type SectionType } from '@/cms/schemas'
import { getDb } from '@/db'
import { contentSections, pageVersions, settings } from '@/db/schema'
import { randomId } from '@/lib/crypto'
import { log } from '@/lib/logger'
import { can, type Capability } from '@/lib/permissions'
import { clientIp } from '@/lib/rate-limit'
import { getCurrentAdmin, type AdminIdentity } from '@/lib/session'
import { recordAudit } from '@/services/admin-auth'

/**
 * CMS mutations. Every one of these:
 *   1. re-reads the session (a server action is a public POST endpoint),
 *   2. checks a capability, not a role name,
 *   3. validates input against the section's zod schema on the server,
 *   4. writes an audit row with before/after,
 *   5. returns a result object; it never throws to the client.
 *
 * Draft saves touch only draft columns. Only `publishPage` writes published
 * columns, and it is the only thing that revalidates the public page.
 */

export interface ActionResult<T = undefined> {
  ok: boolean
  error?: string
  errors?: string[]
  data?: T
}

const PENDING_RESTORE_KEY = 'cms.pending_restore_from'

async function requireCapability(cap: Capability): Promise<{ admin: AdminIdentity } | { error: string }> {
  const admin = await getCurrentAdmin()
  if (!admin) return { error: 'সেশনের মেয়াদ শেষ। আবার প্রবেশ করুন।' }
  if (!can(admin.role, cap)) return { error: 'এই কাজের অনুমতি আপনার নেই।' }
  return { admin }
}

async function ip(): Promise<string> {
  try {
    return clientIp(await headers())
  } catch {
    return ''
  }
}

/** Top-level keys whose value differs. */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => stableStringify(before[k]) !== stableStringify(after[k]))
}

// ---------------------------------------------------------------------------
// Draft edits
// ---------------------------------------------------------------------------

export async function saveSectionDraft(key: string, content: unknown): Promise<ActionResult<{ savedAt: string; changed: string[] }>> {
  const auth = await requireCapability('content.edit')
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = getDb()
  const rows = await db.select().from(contentSections).where(eq(contentSections.key, key)).limit(1)
  const row = rows[0]
  if (!row || row.deletedAt) return { ok: false, error: 'সেকশনটি পাওয়া যায়নি।' }
  if (!isSectionType(row.type)) return { ok: false, error: 'অজানা সেকশন টাইপ।' }

  const parsed = SECTION_SCHEMAS[row.type].safeParse(content ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      error: 'কিছু ঘরের মান সঠিক নয়।',
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    }
  }

  const before = row.draftData ?? {}
  const after = parsed.data as Record<string, unknown>
  const changed = changedFields(before, after)
  const now = new Date()

  if (changed.length > 0) {
    await db.update(contentSections).set({ draftData: after, updatedAt: now }).where(eq(contentSections.id, row.id))
    await recordAudit({
      actorId: auth.admin.userId,
      actorEmail: auth.admin.email,
      action: 'content.draft_saved',
      entityType: 'section',
      entityId: key,
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, after[k]])),
      ip: await ip(),
    })
  }

  return { ok: true, data: { savedAt: now.toISOString(), changed } }
}

export async function setSectionEnabled(key: string, enabled: boolean): Promise<ActionResult> {
  const auth = await requireCapability('content.edit')
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = getDb()
  const rows = await db.select().from(contentSections).where(eq(contentSections.key, key)).limit(1)
  const row = rows[0]
  if (!row || row.deletedAt) return { ok: false, error: 'সেকশনটি পাওয়া যায়নি।' }
  if (row.type === 'hero' && !enabled) return { ok: false, error: 'হিরো সেকশন বন্ধ করা যায় না।' }

  await db.update(contentSections).set({ draftEnabled: enabled, updatedAt: new Date() }).where(eq(contentSections.id, row.id))
  await recordAudit({
    actorId: auth.admin.userId,
    actorEmail: auth.admin.email,
    action: enabled ? 'content.section_enabled' : 'content.section_disabled',
    entityType: 'section',
    entityId: key,
    before: { enabled: row.draftEnabled },
    after: { enabled },
    ip: await ip(),
  })
  return { ok: true }
}

/** Re-number in-page sections 10, 20, 30… in the given key order. */
async function writeOrder(orderedKeys: string[]): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedKeys.length; i += 1) {
      await tx
        .update(contentSections)
        .set({ draftSortOrder: (i + 1) * 10, updatedAt: new Date() })
        .where(eq(contentSections.key, orderedKeys[i]!))
    }
  })
}

async function inPageKeysInDraftOrder(): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ key: contentSections.key, type: contentSections.type })
    .from(contentSections)
    .where(isNull(contentSections.deletedAt))
    .orderBy(asc(contentSections.draftSortOrder))
  return rows.filter((r) => isSectionType(r.type) && SECTION_DEFINITIONS[r.type as SectionType].inPage).map((r) => r.key)
}

export async function moveSection(key: string, direction: 'up' | 'down'): Promise<ActionResult> {
  const auth = await requireCapability('content.edit')
  if ('error' in auth) return { ok: false, error: auth.error }

  const keys = await inPageKeysInDraftOrder()
  const i = keys.indexOf(key)
  if (i < 0) return { ok: false, error: 'সেকশনটি পাওয়া যায়নি।' }
  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= keys.length) return { ok: true }

  const before = [...keys]
  ;[keys[i], keys[j]] = [keys[j]!, keys[i]!]
  await writeOrder(keys)
  await recordAudit({
    actorId: auth.admin.userId,
    actorEmail: auth.admin.email,
    action: 'content.section_moved',
    entityType: 'section',
    entityId: key,
    before: { order: before },
    after: { order: keys },
    ip: await ip(),
  })
  return { ok: true }
}

export async function duplicateSection(key: string): Promise<ActionResult<{ key: string }>> {
  const auth = await requireCapability('content.edit')
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = getDb()
  const rows = await db.select().from(contentSections).where(eq(contentSections.key, key)).limit(1)
  const row = rows[0]
  if (!row || row.deletedAt || !isSectionType(row.type)) return { ok: false, error: 'সেকশনটি পাওয়া যায়নি।' }
  const def = SECTION_DEFINITIONS[row.type]
  if (!def.duplicable) return { ok: false, error: `${def.label} সেকশন একবারই থাকতে পারে।` }

  const newKey = `${row.type}-${randomId(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'copy'}`
  await db.insert(contentSections).values({
    key: newKey,
    type: row.type,
    label: `${row.label} (কপি)`,
    draftData: row.draftData ?? {},
    publishedData: null,
    draftEnabled: false,
    isEnabled: false,
    draftSortOrder: row.draftSortOrder + 1,
    sortOrder: row.sortOrder + 1,
  })
  await writeOrder(await inPageKeysInDraftOrder())
  await recordAudit({
    actorId: auth.admin.userId,
    actorEmail: auth.admin.email,
    action: 'content.section_duplicated',
    entityType: 'section',
    entityId: newKey,
    before: { from: key },
    after: null,
    ip: await ip(),
  })
  return { ok: true, data: { key: newKey } }
}

export async function deleteSection(key: string): Promise<ActionResult> {
  const auth = await requireCapability('content.edit')
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = getDb()
  const rows = await db.select().from(contentSections).where(eq(contentSections.key, key)).limit(1)
  const row = rows[0]
  if (!row || row.deletedAt || !isSectionType(row.type)) return { ok: false, error: 'সেকশনটি পাওয়া যায়নি।' }
  if (!SECTION_DEFINITIONS[row.type].duplicable) {
    return { ok: false, error: 'এই সেকশন মুছে ফেলা যায় না; বন্ধ করে রাখুন।' }
  }

  // Soft delete, and it also leaves the public page immediately on next publish
  // (a deleted row is skipped by the loader). Until then the published copy stays.
  await db
    .update(contentSections)
    .set({ deletedAt: new Date(), draftEnabled: false, updatedAt: new Date() })
    .where(eq(contentSections.id, row.id))
  await recordAudit({
    actorId: auth.admin.userId,
    actorEmail: auth.admin.email,
    action: 'content.section_deleted',
    entityType: 'section',
    entityId: key,
    before: { label: row.label, type: row.type },
    after: null,
    ip: await ip(),
  })
  return { ok: true }
}

export async function discardSectionDraft(key: string): Promise<ActionResult> {
  const auth = await requireCapability('content.edit')
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = getDb()
  const rows = await db.select().from(contentSections).where(eq(contentSections.key, key)).limit(1)
  const row = rows[0]
  if (!row || row.deletedAt) return { ok: false, error: 'সেকশনটি পাওয়া যায়নি।' }
  if (row.publishedData === null) return { ok: false, error: 'এই সেকশন কখনো প্রকাশিত হয়নি; ফেরানোর কিছু নেই।' }

  await db
    .update(contentSections)
    .set({ draftData: row.publishedData, draftEnabled: row.isEnabled, draftSortOrder: row.sortOrder, updatedAt: new Date() })
    .where(eq(contentSections.id, row.id))
  await recordAudit({
    actorId: auth.admin.userId,
    actorEmail: auth.admin.email,
    action: 'content.draft_discarded',
    entityType: 'section',
    entityId: key,
    ip: await ip(),
  })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Publish and versions
// ---------------------------------------------------------------------------

export async function publishPage(): Promise<ActionResult<{ version: number; changedKeys: string[]; warnings: string[] }>> {
  const auth = await requireCapability('content.publish')
  if ('error' in auth) return { ok: false, error: auth.error }

  const check = await checkDraftForPublish()
  if (check.errors.length > 0) {
    return {
      ok: false,
      error: 'প্রকাশ করা যায়নি: আগে নিচের সমস্যাগুলো ঠিক করুন।',
      errors: check.errors.map((e) => `${e.key}: ${e.message}`),
    }
  }

  const db = getDb()
  const rows = await db.select().from(contentSections).where(isNull(contentSections.deletedAt))
  const now = new Date()
  const nextVersion = (await latestVersionNumber()) + 1

  const pending = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, PENDING_RESTORE_KEY)).limit(1)
  const restoredFrom = typeof pending[0]?.value === 'number' ? (pending[0]!.value as number) : null

  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .update(contentSections)
        .set({
          publishedData: r.draftData ?? {},
          isEnabled: r.draftEnabled,
          sortOrder: r.draftSortOrder,
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(contentSections.id, r.id))
    }
    await tx.insert(pageVersions).values({
      version: nextVersion,
      snapshot: {
        sections: rows
          .slice()
          .sort((a, b) => a.draftSortOrder - b.draftSortOrder)
          .map((r) => ({
            key: r.key,
            type: r.type,
            label: r.label,
            enabled: r.draftEnabled,
            sortOrder: r.draftSortOrder,
            content: r.draftData ?? {},
          })),
      },
      changedKeys: check.changedKeys,
      restoredFrom,
      publishedBy: auth.admin.userId,
      publishedByEmail: auth.admin.email,
    })
    if (restoredFrom !== null) {
      await tx.delete(settings).where(eq(settings.key, PENDING_RESTORE_KEY))
    }
  })

  await recordAudit({
    actorId: auth.admin.userId,
    actorEmail: auth.admin.email,
    action: 'content.published',
    entityType: 'page',
    entityId: `v${nextVersion}`,
    before: null,
    after: { version: nextVersion, changedKeys: check.changedKeys, restoredFrom },
    ip: await ip(),
  })

  // The public page is ISR; this drops the cached HTML so the next visitor
  // gets the new content instead of waiting up to a minute.
  revalidatePath('/')
  revalidatePath('/sitemap.xml')
  revalidatePath('/checkout')

  log.info('cms.published', { version: nextVersion, changed: check.changedKeys.length, by: auth.admin.userId })
  return { ok: true, data: { version: nextVersion, changedKeys: check.changedKeys, warnings: check.warnings.map((w) => `${w.key}: ${w.message}`) } }
}

/**
 * Restore copies a version into the DRAFT. Nothing goes live until the admin
 * previews it and publishes, which then records `restoredFrom`.
 */
export async function restoreVersion(version: number): Promise<ActionResult<{ restored: number }>> {
  const auth = await requireCapability('content.publish')
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = getDb()
  const vrows = await db.select().from(pageVersions).where(eq(pageVersions.version, version)).limit(1)
  const v = vrows[0]
  if (!v) return { ok: false, error: 'এই সংস্করণটি পাওয়া যায়নি।' }
  const snap = v.snapshot as { sections?: Array<{ key: string; type: string; label: string; enabled: boolean; sortOrder: number; content: Record<string, unknown> }> }
  const sections = Array.isArray(snap.sections) ? snap.sections : []
  if (sections.length === 0) return { ok: false, error: 'সংস্করণটি খালি।' }

  const existing = await db.select().from(contentSections)
  const byKey = new Map(existing.map((r) => [r.key, r]))
  const snapKeys = new Set(sections.map((s) => s.key))
  const now = new Date()

  await db.transaction(async (tx) => {
    for (const s of sections) {
      const row = byKey.get(s.key)
      if (row) {
        await tx
          .update(contentSections)
          .set({ draftData: s.content, draftEnabled: s.enabled, draftSortOrder: s.sortOrder, deletedAt: null, updatedAt: now })
          .where(eq(contentSections.id, row.id))
      } else if (isSectionType(s.type)) {
        await tx.insert(contentSections).values({
          key: s.key,
          type: s.type,
          label: s.label,
          draftData: s.content,
          publishedData: null,
          draftEnabled: s.enabled,
          isEnabled: false,
          draftSortOrder: s.sortOrder,
          sortOrder: s.sortOrder,
        })
      }
    }
    // Sections that did not exist in that version are switched off in the
    // draft rather than deleted, so nothing is lost by a restore.
    for (const row of existing) {
      if (!snapKeys.has(row.key) && !row.deletedAt) {
        await tx.update(contentSections).set({ draftEnabled: false, updatedAt: now }).where(eq(contentSections.id, row.id))
      }
    }
    await tx
      .insert(settings)
      .values({ key: PENDING_RESTORE_KEY, value: version, label: 'CMS: pending restore source version' })
      .onConflictDoUpdate({ target: settings.key, set: { value: version, updatedAt: now } })
  })

  await recordAudit({
    actorId: auth.admin.userId,
    actorEmail: auth.admin.email,
    action: 'content.version_restored_to_draft',
    entityType: 'page',
    entityId: `v${version}`,
    ip: await ip(),
  })
  return { ok: true, data: { restored: version } }
}

/** Used by the builder to show a count without a second round trip. */
export async function countSections(): Promise<number> {
  const db = getDb()
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(contentSections).where(isNull(contentSections.deletedAt))
  return rows[0]?.n ?? 0
}
