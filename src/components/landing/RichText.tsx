import type { ReactNode } from 'react'

import { splitParagraphs, tokenizeLine } from './rich-parse'

/**
 * Safe inline formatting for CMS long-text fields.
 *
 * The tokeniser (rich-parse.ts) emits plain data; this turns it into React
 * elements. The browser never receives CMS text as HTML: a headline that
 * contains `<script>` renders as those literal characters.
 */

function renderLine(line: string, keyPrefix: string): ReactNode[] {
  return tokenizeLine(line).map((t, i) => {
    const k = `${keyPrefix}-${i}`
    switch (t.kind) {
      case 'bold':
        return <strong key={k}>{t.text}</strong>
      case 'italic':
        return <em key={k}>{t.text}</em>
      case 'link':
        return (
          <a key={k} href={t.href} rel="noopener noreferrer" target="_blank" className="underline decoration-[--color-accent] underline-offset-2">
            {t.text}
          </a>
        )
      default:
        return t.text
    }
  })
}

/** Inline: one block, line breaks become <br>. */
export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <span className={className}>
      {lines.map((line, li) => (
        <span key={li}>
          {renderLine(line, `l${li}`)}
          {li < lines.length - 1 && <br />}
        </span>
      ))}
    </span>
  )
}

/** Block: blank lines separate paragraphs. */
export function RichParagraphs({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  return (
    <>
      {splitParagraphs(text).map((p, pi) => (
        <p key={pi} className={className}>
          <RichText text={p} />
        </p>
      ))}
    </>
  )
}
