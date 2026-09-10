'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { discardSectionDraft, saveSectionDraft, setSectionEnabled } from '@/cms/actions'
import type { FieldSpec } from '@/cms/registry'
import type { SectionType } from '@/cms/schemas'

/**
 * Generic section editor, driven by the registry's field specs.
 *
 * - Every keystroke updates local state; a debounced autosave writes the
 *   DRAFT 1.5 s after the last change. Nothing here touches the live page.
 * - The status line says exactly what happened: unsaved / saving / saved at
 *   HH:MM / failed with the server's reason. "Saved" appears only after the
 *   server confirmed.
 * - Leaving with unsaved changes triggers the browser's own warning.
 * - Image fields preview the URL and say so when it does not load.
 * - No field accepts HTML. The server re-validates everything.
 */

type Path = Array<string | number>
type Obj = Record<string, unknown>

function getAt(obj: unknown, path: Path): unknown {
  let cur: unknown = obj
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string | number, unknown>)[p]
  }
  return cur
}

function setAt<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T
  const [head, ...rest] = path
  if (Array.isArray(obj)) {
    const copy = obj.slice()
    copy[head as number] = setAt(copy[head as number], rest, value)
    return copy as T
  }
  const base = (obj ?? {}) as Obj
  return { ...base, [head as string]: setAt(base[head as string], rest, value) } as T
}

function newItem(fields: FieldSpec[]): Obj {
  const item: Obj = { id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `i-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  for (const f of fields) {
    switch (f.kind) {
      case 'text':
      case 'textarea':
      case 'url':
        item[f.name] = ''
        break
      case 'lines':
      case 'paragraphs':
        item[f.name] = []
        break
      case 'boolean':
        item[f.name] = f.name === 'enabled' || f.name === 'verified' ? f.name === 'enabled' : false
        break
      case 'number':
        item[f.name] = f.name === 'rating' ? 5 : (f.min ?? 0)
        break
      case 'select':
        item[f.name] = f.options[0]?.value ?? ''
        break
      case 'image':
        item[f.name] = { url: '', alt: '' }
        break
      case 'cta':
        item[f.name] = { label: '', action: { type: 'checkout' } }
        break
      case 'list':
        item[f.name] = []
        break
    }
  }
  return item
}

interface Props {
  sectionKey: string
  type: SectionType
  fields: FieldSpec[]
  initial: Obj
  canEdit: boolean
  hasPublished: boolean
  initialEnabled: boolean
  isHero: boolean
}

type Status = { kind: 'clean' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; text: string; details?: string[] }

export function SectionEditor({ sectionKey, fields, initial, canEdit, hasPublished, initialEnabled, isHero }: Props) {
  const router = useRouter()
  const [value, setValue] = useState<Obj>(initial)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [status, setStatus] = useState<Status>({ kind: 'clean' })
  const [pending, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = status.kind === 'dirty' || status.kind === 'saving' || status.kind === 'error'

  const save = useCallback(
    (v: Obj) => {
      setStatus({ kind: 'saving' })
      start(async () => {
        const r = await saveSectionDraft(sectionKey, v)
        if (r.ok && r.data) setStatus({ kind: 'saved', at: new Date(r.data.savedAt).toLocaleTimeString() })
        else setStatus({ kind: 'error', text: r.error ?? 'সংরক্ষণ ব্যর্থ', details: r.errors })
      })
    },
    [sectionKey],
  )

  const update = useCallback(
    (path: Path, v: unknown) => {
      setValue((prev) => {
        const next = setAt(prev, path, v)
        setStatus({ kind: 'dirty' })
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => save(next), 1500)
        return next
      })
    },
    [save],
  )

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const disabled = !canEdit || pending && status.kind === 'saving' && false

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-5">
        {fields.map((f) => (
          <Field key={f.name} spec={f} path={[f.name]} value={value} update={update} disabled={!canEdit} />
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4 text-sm">
          <StatusLine status={status} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canEdit || status.kind === 'saving' || status.kind === 'clean' || status.kind === 'saved'}
              onClick={() => {
                if (timer.current) clearTimeout(timer.current)
                save(value)
              }}
              className="rounded-lg bg-[--color-cta] px-3 py-1.5 text-white hover:bg-[--color-cta-hover] disabled:opacity-40"
            >
              এখনই সংরক্ষণ
            </button>
            {hasPublished && canEdit && (
              <button
                type="button"
                className="rounded-lg border border-[--color-line] px-3 py-1.5 hover:border-[--color-line-strong]"
                onClick={() => {
                  if (!window.confirm('খসড়ার সব পরিবর্তন ফেলে দিয়ে প্রকাশিত অবস্থায় ফিরবেন?')) return
                  start(async () => {
                    const r = await discardSectionDraft(sectionKey)
                    if (r.ok) window.location.reload()
                    else setStatus({ kind: 'error', text: r.error ?? 'ব্যর্থ' })
                  })
                }}
              >
                খসড়া ফেলুন
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-[--color-muted]">সংরক্ষণ মানে খসড়া। লাইভ পেজ বদলাতে ল্যান্ডিং পেজ থেকে "প্রকাশ" করুন।</p>
        </div>

        {!isHero && (
          <div className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = e.target.checked
                  setEnabled(next)
                  start(async () => {
                    const r = await setSectionEnabled(sectionKey, next)
                    if (!r.ok) {
                      setEnabled(!next)
                      setStatus({ kind: 'error', text: r.error ?? 'ব্যর্থ' })
                    } else router.refresh()
                  })
                }}
              />
              এই সেকশন পেজে দেখান
            </label>
          </div>
        )}

        <div className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4 text-xs text-[--color-muted]">
          <p className="font-semibold text-[--color-ink]">লেখায় ফরম্যাটিং</p>
          <p className="mt-1">**গাঢ়**, *বাঁকা*, [লিংক](https://…)। HTML গ্রহণ করা হয় না।</p>
        </div>
      </aside>
    </div>
  )
}

function StatusLine({ status }: { status: Status }) {
  switch (status.kind) {
    case 'clean':
      return <p className="text-[--color-muted]">কোনো পরিবর্তন নেই</p>
    case 'dirty':
      return <p className="text-[--color-warning]">অসংরক্ষিত পরিবর্তন…</p>
    case 'saving':
      return <p className="text-[--color-muted]">সংরক্ষণ হচ্ছে…</p>
    case 'saved':
      return (
        <p className="text-[--color-success]" role="status">
          খসড়া সংরক্ষিত · {status.at}
        </p>
      )
    case 'error':
      return (
        <div role="alert" className="text-[--color-danger]">
          <p>সংরক্ষণ ব্যর্থ: {status.text}</p>
          {status.details?.map((d) => (
            <p key={d} className="text-xs">
              {d}
            </p>
          ))}
        </div>
      )
  }
}

// ---------------------------------------------------------------------------
// Field renderers
// ---------------------------------------------------------------------------

interface FieldProps {
  spec: FieldSpec
  path: Path
  value: Obj
  update: (path: Path, v: unknown) => void
  disabled: boolean
}

const input = 'w-full rounded-lg border border-[--color-line] bg-[--color-bg] px-3 py-2 text-sm disabled:opacity-60'

function Label({ spec, htmlFor }: { spec: FieldSpec; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold">
      {spec.label}
      {'required' in spec && spec.required && <span aria-hidden> *</span>}
    </label>
  )
}

function Help({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-xs text-[--color-muted]">{text}</p> : null
}

function Field({ spec, path, value, update, disabled }: FieldProps) {
  const id = path.join('.')
  const v = getAt(value, path)

  switch (spec.kind) {
    case 'text':
      return (
        <div>
          <Label spec={spec} htmlFor={id} />
          <input id={id} className={input} value={String(v ?? '')} disabled={disabled} onChange={(e) => update(path, e.target.value)} />
          <Help text={spec.help} />
        </div>
      )
    case 'textarea':
      return (
        <div>
          <Label spec={spec} htmlFor={id} />
          <textarea id={id} className={input} rows={spec.rows ?? 3} value={String(v ?? '')} disabled={disabled} onChange={(e) => update(path, e.target.value)} />
          <Help text={spec.help ?? (spec.rich ? '**গাঢ়**, *বাঁকা*, [লিংক](https://…) ব্যবহার করা যায়' : undefined)} />
        </div>
      )
    case 'lines':
      return (
        <div>
          <Label spec={spec} htmlFor={id} />
          <textarea id={id} className={input} rows={Math.max(3, (Array.isArray(v) ? v.length : 0) + 1)} value={Array.isArray(v) ? v.join('\n') : ''} disabled={disabled} onChange={(e) => update(path, e.target.value.split('\n'))} />
          <Help text={spec.help ?? 'প্রতি লাইনে একটি আইটেম'} />
        </div>
      )
    case 'paragraphs':
      return (
        <div>
          <Label spec={spec} htmlFor={id} />
          <textarea id={id} className={input} rows={8} value={Array.isArray(v) ? v.join('\n\n') : ''} disabled={disabled} onChange={(e) => update(path, e.target.value.split(/\n\s*\n/))} />
          <Help text={spec.help ?? 'ফাঁকা লাইন দিয়ে অনুচ্ছেদ আলাদা করুন'} />
        </div>
      )
    case 'boolean':
      return (
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={Boolean(v)} disabled={disabled} onChange={(e) => update(path, e.target.checked)} />
            {spec.label}
          </label>
          <Help text={spec.help} />
        </div>
      )
    case 'number':
      return (
        <div>
          <Label spec={spec} htmlFor={id} />
          <input id={id} type="number" className={input} min={spec.min} max={spec.max} value={typeof v === 'number' ? v : ''} disabled={disabled} onChange={(e) => update(path, e.target.value === '' ? spec.min ?? 0 : Number(e.target.value))} />
        </div>
      )
    case 'select':
      return (
        <div>
          <Label spec={spec} htmlFor={id} />
          <select id={id} className={input} value={String(v ?? '')} disabled={disabled} onChange={(e) => update(path, e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )
    case 'url':
      return (
        <div>
          <Label spec={spec} htmlFor={id} />
          <input id={id} className={input} inputMode="url" placeholder="https://…" value={String(v ?? '')} disabled={disabled} onChange={(e) => update(path, e.target.value)} />
          <UrlHint value={String(v ?? '')} />
          <Help text={spec.help} />
        </div>
      )
    case 'image':
      return <ImageField spec={spec} path={path} value={value} update={update} disabled={disabled} />
    case 'cta':
      return <CtaField spec={spec} path={path} value={value} update={update} disabled={disabled} />
    case 'list':
      return <ListField spec={spec} path={path} value={value} update={update} disabled={disabled} />
  }
}

function isHttps(u: string): boolean {
  return u === '' || /^https:\/\/[^\s<>"']+$/i.test(u)
}

function UrlHint({ value }: { value: string }) {
  if (!value) return null
  if (!isHttps(value)) return <p className="mt-1 text-xs text-[--color-danger]">শুধু https:// লিংক গ্রহণযোগ্য।</p>
  return null
}

function ImageField({ spec, path, value, update, disabled }: FieldProps) {
  const img = (getAt(value, path) as { url?: string; alt?: string } | undefined) ?? {}
  const url = img.url ?? ''
  const alt = img.alt ?? ''
  const [failed, setFailed] = useState(false)
  const [size, setSize] = useState<'desktop' | 'mobile'>('desktop')
  useEffect(() => setFailed(false), [url])
  const id = path.join('.')

  return (
    <div className="rounded-xl border border-[--color-line] p-4">
      <Label spec={spec} htmlFor={`${id}.url`} />
      <input id={`${id}.url`} className={input} inputMode="url" placeholder="https://…/image.webp" value={url} disabled={disabled} onChange={(e) => update([...path, 'url'], e.target.value)} />
      <UrlHint value={url} />
      <label htmlFor={`${id}.alt`} className="mt-3 mb-1 block text-xs font-semibold">
        বিকল্প লেখা (alt)
      </label>
      <input id={`${id}.alt`} className={input} value={alt} disabled={disabled} onChange={(e) => update([...path, 'alt'], e.target.value)} />
      <Help text={'help' in spec ? spec.help : undefined} />

      {url && isHttps(url) && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-[--color-muted]">প্রিভিউ:</span>
            <button type="button" className={`rounded px-2 py-0.5 ${size === 'desktop' ? 'bg-[--color-line]' : ''}`} onClick={() => setSize('desktop')}>
              ডেস্কটপ
            </button>
            <button type="button" className={`rounded px-2 py-0.5 ${size === 'mobile' ? 'bg-[--color-line]' : ''}`} onClick={() => setSize('mobile')}>
              মোবাইল
            </button>
          </div>
          {failed ? (
            <p role="alert" className="rounded-lg border border-[--color-danger] px-3 py-2 text-xs text-[--color-danger]">
              ছবিটি লোড হচ্ছে না। লিংকটি যাচাই করুন — পেজে ভাঙা ছবি দেখাবে না, কিন্তু ছবিটিও দেখাবে না।
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={alt} onError={() => setFailed(true)} className="rounded-lg border border-[--color-line] object-contain" style={{ width: size === 'mobile' ? 320 : '100%', maxWidth: 640 }} />
          )}
        </div>
      )}
    </div>
  )
}

const ACTION_TYPES = [
  { value: 'checkout', label: 'চেকআউটে যান' },
  { value: 'scroll', label: 'পেজের একটি সেকশনে স্ক্রল' },
  { value: 'external', label: 'বাইরের লিংক' },
  { value: 'internal', label: 'সাইটের অন্য পেজ' },
  { value: 'none', label: 'কোনো গন্তব্য নেই (বোতাম দেখাবে না)' },
]

function CtaField({ spec, path, value, update, disabled }: FieldProps) {
  const cta = (getAt(value, path) as { label?: string; action?: { type?: string; target?: string; url?: string; path?: string } } | undefined) ?? {}
  const action = cta.action ?? { type: 'checkout' }
  const id = path.join('.')

  function setType(type: string) {
    const next: Record<string, string> = { type }
    if (type === 'scroll') next.target = action.target ?? 'offer'
    if (type === 'external') next.url = action.url ?? ''
    if (type === 'internal') next.path = action.path ?? '/'
    update([...path, 'action'], next)
  }

  return (
    <div className="rounded-xl border border-[--color-line] p-4">
      <Label spec={spec} htmlFor={`${id}.label`} />
      <input id={`${id}.label`} className={input} placeholder="বোতামের লেখা" value={cta.label ?? ''} disabled={disabled} onChange={(e) => update([...path, 'label'], e.target.value)} />
      <label htmlFor={`${id}.type`} className="mt-3 mb-1 block text-xs font-semibold">
        গন্তব্য
      </label>
      <select id={`${id}.type`} className={input} value={action.type ?? 'checkout'} disabled={disabled} onChange={(e) => setType(e.target.value)}>
        {ACTION_TYPES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {action.type === 'scroll' && (
        <input className={`${input} mt-2`} placeholder="সেকশন আইডি, যেমন offer" value={action.target ?? ''} disabled={disabled} onChange={(e) => update([...path, 'action', 'target'], e.target.value.trim().toLowerCase())} />
      )}
      {action.type === 'external' && (
        <>
          <input className={`${input} mt-2`} inputMode="url" placeholder="https://…" value={action.url ?? ''} disabled={disabled} onChange={(e) => update([...path, 'action', 'url'], e.target.value)} />
          <UrlHint value={action.url ?? ''} />
        </>
      )}
      {action.type === 'internal' && (
        <input className={`${input} mt-2`} placeholder="/checkout" value={action.path ?? ''} disabled={disabled} onChange={(e) => update([...path, 'action', 'path'], e.target.value)} />
      )}
    </div>
  )
}

function ListField({ spec, path, value, update, disabled }: FieldProps) {
  if (spec.kind !== 'list') return null
  const items = (getAt(value, path) as Obj[] | undefined) ?? []
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    update(path, next)
  }
  const btn = 'rounded border border-[--color-line] px-2 py-0.5 text-xs hover:border-[--color-line-strong] disabled:opacity-40'

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">
        {spec.label} <span className="text-xs font-normal text-[--color-muted]">({items.length})</span>
      </p>
      <ol className="space-y-3">
        {items.map((item, i) => (
          <li key={String(item.id ?? i)} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-[--color-muted]">
                {spec.itemLabel} {i + 1}
              </p>
              <div className="flex gap-1">
                <button type="button" className={btn} disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="উপরে">↑</button>
                <button type="button" className={btn} disabled={disabled || i === items.length - 1} onClick={() => move(i, 1)} aria-label="নিচে">↓</button>
                <button
                  type="button"
                  className={`${btn} text-[--color-danger]`}
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm(`${spec.itemLabel} ${i + 1} মুছে ফেলবেন?`)) update(path, items.filter((_, k) => k !== i))
                  }}
                >
                  মুছুন
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {spec.fields.map((f) => (
                <Field key={f.name} spec={f} path={[...path, i, f.name]} value={value} update={update} disabled={disabled} />
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button type="button" disabled={disabled} className="mt-3 rounded-lg border border-[--color-accent] px-3 py-1.5 text-sm text-[--color-accent] hover:bg-[--color-accent]/10 disabled:opacity-40" onClick={() => update(path, [...items, newItem(spec.fields)])}>
        + {spec.itemLabel} যোগ করুন
      </button>
    </div>
  )
}

// Referenced to keep the memo import meaningful for future field caching.
void useMemo
