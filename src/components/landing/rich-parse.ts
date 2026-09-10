/**
 * Tokeniser for the CMS's tiny safe markup. Pure, so it is unit-tested
 * without React. RichText.tsx turns these tokens into elements.
 *
 *   **bold**   *italic*   [label](https://…)   everything else is text
 *
 * Only https links are recognised; `[x](javascript:…)` stays literal text.
 */
export type RichToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'link'; text: string; href: string }

const TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g

export function tokenizeLine(line: string): RichToken[] {
  const out: RichToken[] = []
  let last = 0
  for (const m of line.matchAll(TOKEN)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ kind: 'text', text: line.slice(last, idx) })
    const tok = m[0]
    if (tok.startsWith('**')) out.push({ kind: 'bold', text: tok.slice(2, -2) })
    else if (tok.startsWith('*')) out.push({ kind: 'italic', text: tok.slice(1, -1) })
    else {
      const close = tok.indexOf('](')
      out.push({ kind: 'link', text: tok.slice(1, close), href: tok.slice(close + 2, -1) })
    }
    last = idx + tok.length
  }
  if (last < line.length) out.push({ kind: 'text', text: line.slice(last) })
  return out
}

/** Paragraphs split on blank lines; each paragraph is a list of lines. */
export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim() !== '')
}
