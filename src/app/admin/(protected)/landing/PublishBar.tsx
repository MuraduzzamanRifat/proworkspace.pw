'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { publishPage } from '@/cms/actions'

interface Props {
  changedKeys: string[]
  errors: string[]
  warnings: string[]
  canPublish: boolean
}

/**
 * The Publish control.
 *
 * Shows exactly what will go live (changed sections), what blocks it
 * (errors), and what is merely worth knowing (warnings). The button is
 * disabled when there is nothing to publish or something blocks it, and the
 * success message appears only after the server reports the new version.
 */
export function PublishBar({ changedKeys, errors, warnings, canPublish }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null)

  const blocked = errors.length > 0
  const nothing = changedKeys.length === 0

  function publish() {
    setResult(null)
    start(async () => {
      const r = await publishPage()
      if (r.ok && r.data) {
        setResult({
          ok: true,
          text: `প্রকাশ সফল হয়েছে — সংস্করণ v${r.data.version}। ${r.data.changedKeys.length}টি সেকশন হালনাগাদ হয়েছে।`,
          details: r.data.warnings,
        })
        router.refresh()
      } else {
        setResult({ ok: false, text: r.error ?? 'প্রকাশ ব্যর্থ', details: r.errors })
      }
    })
  }

  return (
    <section
      aria-label="প্রকাশ"
      className={`rounded-2xl border p-5 ${blocked ? 'border-[--color-danger]' : nothing ? 'border-[--color-line]' : 'border-[--color-warning]'} bg-[--color-surface]`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {nothing && !blocked && <p className="text-sm text-[--color-muted]">সব পরিবর্তন প্রকাশিত। লাইভ পেজ খসড়ার সঙ্গে মিলে আছে।</p>}
          {!nothing && (
            <p className="text-sm">
              <span className="font-semibold">প্রকাশের অপেক্ষায়:</span>{' '}
              <span className="text-[--color-muted]">{changedKeys.join(', ')}</span>
            </p>
          )}
          {errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-[--color-danger]">
              {errors.map((e) => (
                <li key={e}>✕ {e}</li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-[--color-warning]">
              {warnings.map((w) => (
                <li key={w}>! {w}</li>
              ))}
            </ul>
          )}
        </div>

        {canPublish ? (
          <button
            type="button"
            onClick={publish}
            disabled={pending || blocked || nothing}
            className="rounded-xl bg-[--color-cta] px-6 py-3 font-semibold text-white hover:bg-[--color-cta-hover] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'প্রকাশ হচ্ছে…' : 'পরিবর্তন প্রকাশ করুন'}
          </button>
        ) : (
          <p className="text-xs text-[--color-muted]">প্রকাশ করার অনুমতি আপনার নেই।</p>
        )}
      </div>

      {result && (
        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${result.ok ? 'border-[--color-success] text-[--color-success]' : 'border-[--color-danger] text-[--color-danger]'}`} role={result.ok ? 'status' : 'alert'}>
          <p>{result.text}</p>
          {result.details && result.details.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs opacity-90">
              {result.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
