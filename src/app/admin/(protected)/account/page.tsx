import { getCurrentAdmin } from '@/lib/session'
import { PasswordForm } from './PasswordForm'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  // The (protected) layout already redirected if this is null; the read is
  // only to show who is signed in.
  const admin = await getCurrentAdmin()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl">অ্যাকাউন্ট</h1>
        <p className="mt-2 text-sm text-[--color-muted]">
          {admin?.email} · {admin?.role}
        </p>
      </div>

      <section className="rounded-xl border border-[--color-line] bg-[--color-surface] p-5">
        <h2 className="mb-1 text-lg font-semibold">পাসওয়ার্ড বদলান</h2>
        <p className="mb-5 text-sm text-[--color-muted]">
          প্রথমবার প্রবেশের পর সিড করা পাসওয়ার্ডটি এখানেই বদলে নিন। বদলানোর পর অন্য সব ডিভাইসের
          সেশন বাতিল হয়ে যাবে।
        </p>
        <PasswordForm />
      </section>
    </div>
  )
}
