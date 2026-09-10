'use server'

import { revalidatePath } from 'next/cache'

import { taka } from '@/domain/money'
import { IllegalTransitionError } from '@/domain/order-state'
import { getCurrentAdmin } from '@/lib/session'
import { log } from '@/lib/logger'
import {
  AdminActionError,
  recordRefund,
  resendDelivery,
  setGrantRevoked,
} from '@/services/orders-admin'

export interface ActionState {
  ok?: string
  error?: string
}

/**
 * Every action re-checks the session itself.
 *
 * The (protected) layout already gates the page, but a server action is a
 * callable POST endpoint in its own right. Relying on the layout would mean
 * relying on the UI, and the UI is not an access control mechanism.
 */
async function requireAdmin() {
  const admin = await getCurrentAdmin()
  if (!admin) throw new AdminActionError('unauthenticated', 'সেশনের মেয়াদ শেষ। আবার প্রবেশ করুন।')
  return admin
}

function toState(err: unknown): ActionState {
  if (err instanceof AdminActionError) return { error: err.message }
  if (err instanceof IllegalTransitionError) {
    return { error: `এই অর্ডারের বর্তমান অবস্থায় (${err.from}) এটি করা যায় না।` }
  }
  log.error('admin.action_failed', { err })
  return { error: 'কাজটি সম্পন্ন করা যায়নি।' }
}

export async function recordRefundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderNumber = String(formData.get('orderNumber') ?? '')
  const amountRaw = String(formData.get('amount') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()

  try {
    const admin = await requireAdmin()

    const amountTaka = Number(amountRaw)
    if (!Number.isFinite(amountTaka) || amountTaka <= 0) {
      return { error: 'ফেরতের পরিমাণ সঠিক নয়।' }
    }

    const result = await recordRefund({
      orderNumber,
      amountPoisha: taka(amountTaka),
      reason,
      actor: admin,
    })

    revalidatePath(`/admin/orders/${orderNumber}`)
    revalidatePath('/admin/orders')
    revalidatePath('/admin')

    return {
      ok:
        result.status === 'refunded'
          ? 'সম্পূর্ণ ফেরত রেকর্ড হয়েছে। ডাউনলোডের অনুমতি বাতিল করা হয়েছে।'
          : 'আংশিক ফেরত রেকর্ড হয়েছে।',
    }
  } catch (err) {
    return toState(err)
  }
}

export async function resendDeliveryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderNumber = String(formData.get('orderNumber') ?? '')

  try {
    const admin = await requireAdmin()
    const result = await resendDelivery({ orderNumber, actor: admin })

    revalidatePath(`/admin/orders/${orderNumber}`)

    return result.sent
      ? { ok: 'ডেলিভারি ইমেইল আবার পাঠানো হয়েছে।' }
      : { error: `ইমেইল পাঠানো যায়নি: ${result.reason ?? 'অজানা কারণ'}` }
  } catch (err) {
    return toState(err)
  }
}

export async function toggleDownloadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderNumber = String(formData.get('orderNumber') ?? '')
  const revoke = String(formData.get('revoke') ?? '') === '1'

  try {
    const admin = await requireAdmin()
    await setGrantRevoked({ orderNumber, revoked: revoke, actor: admin })

    revalidatePath(`/admin/orders/${orderNumber}`)

    return { ok: revoke ? 'ডাউনলোড বাতিল করা হয়েছে।' : 'ডাউনলোড আবার চালু করা হয়েছে।' }
  } catch (err) {
    return toState(err)
  }
}
