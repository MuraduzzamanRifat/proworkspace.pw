/** One-line result banner driven by ?msg= / ?error= after a form action. */
export function Flash({ params }: { params: Record<string, string | string[] | undefined> }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  const msg = one(params['msg'])
  const error = one(params['error'])
  if (!msg && !error) return null
  return error ? (
    <p role="alert" className="rounded-lg border border-[--color-danger] px-4 py-3 text-sm text-[--color-danger]">
      {error}
    </p>
  ) : (
    <p role="status" className="rounded-lg border border-[--color-success] px-4 py-3 text-sm text-[--color-success]">
      {msg}
    </p>
  )
}

export const inputCls = 'w-full rounded-lg border border-[--color-line] bg-[--color-bg] px-3 py-2 text-sm'
export const btnCls = 'rounded-lg bg-[--color-cta] px-4 py-2 text-sm font-semibold text-white hover:bg-[--color-cta-hover] disabled:opacity-50'
export const btnGhost = 'rounded-lg border border-[--color-line] px-3 py-1.5 text-xs hover:border-[--color-line-strong]'
