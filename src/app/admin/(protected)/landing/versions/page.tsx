import Link from 'next/link'

import { listVersions } from '@/cms/admin-read'
import { can } from '@/lib/permissions'
import { getCurrentAdmin } from '@/lib/session'
import { RestoreButton } from './RestoreButton'

export const dynamic = 'force-dynamic'

export default async function VersionsPage() {
  const [admin, versions] = await Promise.all([getCurrentAdmin(), listVersions(100)])
  const canRestore = admin ? can(admin.role, 'content.publish') : false
  const latest = versions[0]?.version ?? 0

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/landing" className="text-sm text-[--color-muted] hover:text-[--color-ink]">
          ← ল্যান্ডিং পেজ
        </Link>
        <h1 className="mt-3 text-2xl">সংস্করণ ইতিহাস</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          প্রতিটি প্রকাশ একটি সংস্করণ। "ফেরান" খসড়ায় কপি করে; লাইভ পেজ বদলাতে তারপর প্রকাশ করতে হবে। ইতিহাস কখনো মুছে যায় না।
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[--color-line]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[--color-surface] text-[--color-muted]">
            <tr>
              <th className="px-4 py-3 font-medium">সংস্করণ</th>
              <th className="px-4 py-3 font-medium">কে</th>
              <th className="px-4 py-3 font-medium">কখন</th>
              <th className="px-4 py-3 font-medium">বদলেছে</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version} className="border-t border-[--color-line] align-top">
                <td className="px-4 py-3">
                  <Link href={`/admin/landing/versions/${v.version}`} className="font-mono text-[--color-accent] hover:underline">
                    v{v.version}
                  </Link>
                  {v.version === latest && <span className="ml-2 rounded-full border border-[--color-success] px-2 py-0.5 text-xs text-[--color-success]">লাইভ</span>}
                  {v.restoredFrom !== null && <span className="ml-2 text-xs text-[--color-muted]">v{v.restoredFrom} থেকে ফেরানো</span>}
                </td>
                <td className="px-4 py-3 text-[--color-muted]">{v.publishedByEmail}</td>
                <td className="px-4 py-3 text-[--color-muted]">{v.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                <td className="px-4 py-3 text-xs text-[--color-muted]">{v.changedKeys.length === 0 ? '—' : v.changedKeys.join(', ')}</td>
                <td className="px-4 py-3 text-right">{canRestore && v.version !== latest && <RestoreButton version={v.version} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
