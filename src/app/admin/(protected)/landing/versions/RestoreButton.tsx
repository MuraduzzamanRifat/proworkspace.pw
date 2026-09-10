'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { restoreVersion } from '@/cms/actions'

export function RestoreButton({ version }: { version: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border border-[--color-line] px-3 py-1.5 text-xs hover:border-[--color-line-strong] disabled:opacity-40"
        onClick={() => {
          if (!window.confirm(`সংস্করণ v${version} খসড়ায় ফেরাবেন? লাইভ পেজ এখনই বদলাবে না — প্রিভিউ দেখে প্রকাশ করতে হবে।`)) return
          start(async () => {
            const r = await restoreVersion(version)
            if (r.ok) {
              setMsg('খসড়ায় ফেরানো হয়েছে। এখন প্রিভিউ দেখে প্রকাশ করুন।')
              router.push('/admin/landing')
              router.refresh()
            } else setMsg(r.error ?? 'ব্যর্থ')
          })
        }}
      >
        {pending ? 'ফেরানো হচ্ছে…' : 'এই সংস্করণ ফেরান'}
      </button>
      {msg && <p className="text-xs text-[--color-muted]">{msg}</p>}
    </div>
  )
}
