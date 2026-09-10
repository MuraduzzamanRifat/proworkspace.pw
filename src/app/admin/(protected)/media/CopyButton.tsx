'use client'

import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="rounded-lg border border-[--color-line] px-3 py-1.5 text-xs hover:border-[--color-line-strong]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          window.prompt('লিংকটি কপি করুন:', text)
        }
      }}
    >
      {done ? 'কপি হয়েছে' : 'লিংক কপি'}
    </button>
  )
}
