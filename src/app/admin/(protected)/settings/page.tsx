import { Flash, btnCls, inputCls } from '@/components/admin/Flash'
import { emailConfigured, paymentsConfigured, missingProductFiles } from '@/config/env'
import { PRODUCT } from '@/config/product'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { getFlags, getPublicSettings } from '@/services/flags'
import { updateSettings } from './actions'

export const dynamic = 'force-dynamic'

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, admin, flags, s] = await Promise.all([searchParams, getCurrentAdmin(), getFlags(), getPublicSettings()])
  const canManage = admin ? can(admin.role, 'settings.manage') : false
  const missingFiles = missingProductFiles(PRODUCT.deliverables.map((d) => d.key))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">সেটিংস</h1>
        <p className="mt-1 text-sm text-[--color-muted]">এখানে শুধু সেই সেটিংস আছে যেগুলো কোডে সত্যিই কিছু বদলায়। গোপন কী (পেমেন্ট, ইমেইল, ডেটাবেস) এখানে কখনো থাকে না — সেগুলো Vercel-এর এনভায়রনমেন্টে।</p>
      </div>
      <Flash params={params} />

      <form action={updateSettings} className="space-y-6 rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
        <fieldset className="space-y-3">
          <legend className="font-semibold">সাধারণ</legend>
          <label className="block">
            <span className="mb-1 block text-sm">সহায়তার ইমেইল</span>
            <input name="support_email" type="email" defaultValue={s.supportEmail} className={inputCls} disabled={!canManage} />
            <span className="mt-1 block text-xs text-[--color-muted]">ফুটারে ও ডাউনলোড-সমস্যার বার্তায় দেখানো হয়।</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">প্রতি অর্ডারে সর্বোচ্চ ডাউনলোড</span>
            <input name="download_max_per_order" type="number" min="1" max="1000" defaultValue={s.downloadMaxPerOrder ?? ''} className={inputCls} disabled={!canManage} placeholder="খালি = সীমাহীন" />
            <span className="mt-1 block text-xs text-[--color-muted]">নতুন অর্ডারের ডাউনলোড-অনুমতিতে লেখা হয়; পুরোনো অর্ডারে প্রভাব নেই।</span>
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-semibold">ফানেল</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sticky_cta_enabled" defaultChecked={flags.stickyCta} disabled={!canManage} /> মোবাইলে নিচে স্টিকি "কিনুন" বার
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="coupons_enabled" defaultChecked={flags.couponsEnabled} disabled={!canManage} /> চেকআউটে কুপন কোডের ঘর
          </label>
        </fieldset>

        {canManage && (
          <button type="submit" className={btnCls}>
            সংরক্ষণ করুন
          </button>
        )}
      </form>

      <section className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5 text-sm">
        <h2 className="mb-3 font-semibold">এনভায়রনমেন্ট (শুধু পড়া যায়)</h2>
        <ul className="space-y-1 text-[--color-muted]">
          <li>পেমেন্ট গেটওয়ে: {paymentsConfigured() ? <span className="text-[--color-success]">সেট আছে</span> : <span className="text-[--color-danger]">সেট নেই</span>}</li>
          <li>ইমেইল প্রোভাইডার: {emailConfigured() ? <span className="text-[--color-success]">সেট আছে</span> : <span className="text-[--color-danger]">সেট নেই</span>}</li>
          <li>
            পণ্যের ফাইল: {missingFiles.length === 0 ? <span className="text-[--color-success]">সব সেট আছে</span> : <span className="text-[--color-danger]">সেট নেই: {missingFiles.join(', ')}</span>}
          </li>
          <li>মিডিয়া আপলোড (Blob): {process.env.BLOB_READ_WRITE_TOKEN ? <span className="text-[--color-success]">চালু</span> : <span className="text-[--color-warning]">বন্ধ — Blob স্টোর যুক্ত করুন</span>}</li>
        </ul>
      </section>
    </div>
  )
}
