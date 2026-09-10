'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { deleteSection, discardSectionDraft, duplicateSection, moveSection, setSectionEnabled } from '@/cms/actions'

interface Props {
  sectionKey: string
  enabled: boolean
  isFirst: boolean
  isLast: boolean
  duplicable: boolean
  changed: boolean
  neverPublished: boolean
  isHero: boolean
  canEdit: boolean
}

/**
 * Row buttons for the page builder. Each one calls a server action, shows
 * its result, and refreshes the server-rendered list. Nothing here touches
 * the published page; these are draft operations.
 */
export function RowActions(p: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!p.canEdit) return null

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null)
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? { ok: true, text: label } : { ok: false, text: r.error ?? 'ব্যর্থ' })
      if (r.ok) router.refresh()
    })
  }

  // 44px minimum on touch screens; compact on desktop where a pointer is precise.
  const btn = 'min-h-11 rounded-lg border border-[--color-line] px-3 py-2 text-xs transition-colors hover:border-[--color-line-strong] disabled:opacity-40 sm:min-h-0 sm:py-1'

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={pending || p.isFirst} className={btn} onClick={() => run('উপরে সরানো হয়েছে', () => moveSection(p.sectionKey, 'up'))} aria-label="উপরে">
          ↑
        </button>
        <button type="button" disabled={pending || p.isLast} className={btn} onClick={() => run('নিচে সরানো হয়েছে', () => moveSection(p.sectionKey, 'down'))} aria-label="নিচে">
          ↓
        </button>
        {!p.isHero && (
          <button type="button" disabled={pending} className={btn} onClick={() => run(p.enabled ? 'বন্ধ করা হয়েছে' : 'চালু করা হয়েছে', () => setSectionEnabled(p.sectionKey, !p.enabled))}>
            {p.enabled ? 'বন্ধ করুন' : 'চালু করুন'}
          </button>
        )}
        {p.duplicable && (
          <button type="button" disabled={pending} className={btn} onClick={() => run('কপি তৈরি হয়েছে (বন্ধ অবস্থায়)', () => duplicateSection(p.sectionKey))}>
            কপি
          </button>
        )}
        {p.changed && !p.neverPublished && (
          <button
            type="button"
            disabled={pending}
            className={btn}
            onClick={() => {
              if (window.confirm('এই সেকশনের খসড়া পরিবর্তন ফেলে দিয়ে প্রকাশিত অবস্থায় ফিরবেন?')) run('খসড়া ফেরানো হয়েছে', () => discardSectionDraft(p.sectionKey))
            }}
          >
            খসড়া ফেলুন
          </button>
        )}
        {p.duplicable && (
          <button
            type="button"
            disabled={pending}
            className={`${btn} text-[--color-danger]`}
            onClick={() => {
              if (window.confirm('সেকশনটি মুছে ফেলবেন? প্রকাশ করলে পেজ থেকে চলে যাবে। ইতিহাসে থেকে যাবে।')) run('মুছে ফেলা হয়েছে', () => deleteSection(p.sectionKey))
            }}
          >
            মুছুন
          </button>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.ok ? 'text-[--color-success]' : 'text-[--color-danger]'}`}>{msg.text}</p>}
    </div>
  )
}
