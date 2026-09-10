import { desc, ilike, isNull, and } from 'drizzle-orm'

import { Flash, btnCls, btnGhost, inputCls } from '@/components/admin/Flash'
import { getDb } from '@/db'
import { media } from '@/db/schema'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { CopyButton } from './CopyButton'
import { deleteMedia, registerMediaUrl, updateMediaAlt, uploadMedia } from './actions'

export const dynamic = 'force-dynamic'

export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, admin] = await Promise.all([searchParams, getCurrentAdmin()])
  const canManage = admin ? can(admin.role, 'media.manage') : false
  const raw = params['q']
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  const uploadsOn = Boolean(process.env.BLOB_READ_WRITE_TOKEN)

  const rows = await getDb()
    .select()
    .from(media)
    .where(q ? and(isNull(media.deletedAt), ilike(media.filename, `%${q}%`)) : isNull(media.deletedAt))
    .orderBy(desc(media.createdAt))
    .limit(200)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">মিডিয়া</h1>
        <p className="mt-1 text-sm text-[--color-muted]">ছবির লিংক যোগ করুন বা আপলোড করুন, তারপর লিংকটি কপি করে ল্যান্ডিং পেজের ছবির ঘরে বসান।</p>
      </div>
      <Flash params={params} />

      {canManage && (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={registerMediaUrl} className="space-y-3 rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
            <p className="font-semibold">ছবির লিংক যোগ করুন</p>
            <input name="url" className={inputCls} inputMode="url" placeholder="https://…/image.webp" required />
            <input name="alt" className={inputCls} placeholder="বিকল্প লেখা (alt)" />
            <p className="text-xs text-[--color-muted]">লিংকটি সার্ভার থেকে একবার আনা হবে: ছবি না হলে বা না খুললে এখানেই জানানো হবে।</p>
            <button type="submit" className={btnCls}>যাচাই করে যোগ করুন</button>
          </form>

          <form action={uploadMedia} className="space-y-3 rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
            <p className="font-semibold">আপলোড করুন</p>
            {uploadsOn ? (
              <>
                <input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className={inputCls} required />
                <input name="alt" className={inputCls} placeholder="বিকল্প লেখা (alt)" />
                <p className="text-xs text-[--color-muted]">WebP-তে রূপান্তর হবে ৬৪০ / ১২৮০ / ১৯২০ প্রস্থে। মোবাইলে বড় ছবি যাবে না।</p>
                <button type="submit" className={btnCls}>আপলোড</button>
              </>
            ) : (
              <p className="rounded-lg border border-[--color-warning] px-3 py-2 text-xs text-[--color-warning]">
                আপলোড এখনো চালু নেই: Vercel প্রজেক্টে একটি Blob স্টোর যুক্ত করলে (Storage → Create → Blob) স্বয়ংক্রিয়ভাবে চালু হবে। আপাতত ছবির লিংক ব্যবহার করুন।
              </p>
            )}
          </form>
        </div>
      )}

      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="ফাইলের নাম" className={`${inputCls} max-w-sm`} aria-label="মিডিয়া খুঁজুন" />
        <button type="submit" className={btnCls}>খুঁজুন</button>
      </form>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.length === 0 && <li className="text-sm text-[--color-muted]">লাইব্রেরি খালি।</li>}
        {rows.map((m) => (
          <li key={m.id} className="rounded-xl border border-[--color-line] bg-[--color-surface] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
            <p className="mt-2 truncate text-xs font-semibold" title={m.filename}>
              {m.filename || m.url}
            </p>
            <p className="text-xs text-[--color-muted]">
              {m.width && m.height ? `${m.width}×${m.height}` : '—'} · {m.mime || '—'} · {m.bytes ? `${Math.round(m.bytes / 1024)} KB` : '—'} · {m.source === 'upload' ? 'আপলোড' : 'লিংক'} · {m.createdAt.toISOString().slice(0, 10)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyButton text={m.url} />
              {canManage && (
                <>
                  <form action={updateMediaAlt} className="flex flex-1 gap-1">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="alt" defaultValue={m.alt} placeholder="alt" className={`${inputCls} py-1 text-xs`} />
                    <button type="submit" className={btnGhost}>alt</button>
                  </form>
                  <form action={deleteMedia}>
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className={`${btnGhost} text-[--color-danger]`}>সরান</button>
                  </form>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
