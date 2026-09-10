import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { serverEnv } from '@/config/env'
import { getDb } from '@/db'
import { downloadEvents, downloadGrants, orders } from '@/db/schema'
import { TokenError, verifyToken } from '@/lib/crypto'
import { withConfigGuard } from '@/lib/http'
import { log } from '@/lib/logger'
import { clientIp, consumeRateLimit } from '@/lib/rate-limit'
import { TOKEN_KIND_DOWNLOAD } from '@/services/fulfilment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/download/[token]
 *
 * The paid product. Four things are checked before a single byte is served:
 * the HMAC signature, the expiry inside the token, the grant row's own state
 * (revoked, expired, over its download cap), and the order still being in an
 * entitled state.
 *
 * The bytes are streamed through this route rather than the customer being
 * redirected to storage, so the private file URL is never exposed and a
 * revoked grant actually stops working.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  return withConfigGuard(() => handle(request, context))
}

async function handle(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params
  const ip = clientIp(request.headers)
  const db = getDb()

  // Blunt abuse ceiling: 60 download requests per IP per hour.
  const limit = await consumeRateLimit(`download:${ip}`, 60, 3600)
  if (!limit.allowed) {
    return jsonError('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।', 429, {
      'Retry-After': String(limit.retryAfterSeconds),
    })
  }

  // --- 1. Signature, expiry and token kind --------------------------------
  let grantPublicId: string
  try {
    const payload = verifyToken(token, serverEnv().DOWNLOAD_SECRET)
    // A receipt token is signed with the same secret. Without this check it
    // would also open the file.
    if (payload['kind'] !== TOKEN_KIND_DOWNLOAD) {
      throw new TokenError('bad_signature')
    }
    grantPublicId = payload.sub
  } catch (err) {
    const reason = err instanceof TokenError ? err.reason : 'invalid'
    log.warn('download.token_rejected', { reason, ip })
    return jsonError(
      reason === 'expired'
        ? 'ডাউনলোড লিংকের মেয়াদ শেষ হয়েছে। সহায়তার জন্য যোগাযোগ করুন।'
        : 'ডাউনলোড লিংকটি সঠিক নয়।',
      reason === 'expired' ? 410 : 403,
    )
  }

  // --- 2. Grant and order state -------------------------------------------
  const rows = await db
    .select({
      grantId: downloadGrants.id,
      maxDownloads: downloadGrants.maxDownloads,
      downloadCount: downloadGrants.downloadCount,
      expiresAt: downloadGrants.expiresAt,
      revokedAt: downloadGrants.revokedAt,
      orderStatus: orders.status,
      orderNumber: orders.orderNumber,
    })
    .from(downloadGrants)
    .innerJoin(orders, eq(downloadGrants.orderId, orders.id))
    .where(eq(downloadGrants.publicId, grantPublicId))
    .limit(1)

  const grant = rows[0]
  if (!grant) {
    log.warn('download.unknown_grant', { ip })
    return jsonError('ডাউনলোড লিংকটি সঠিক নয়।', 403)
  }

  const deny = async (reason: string, messageBn: string, status: number) => {
    await db.insert(downloadEvents).values({
      grantId: grant.grantId,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? '',
      succeeded: false,
      reason,
    })
    log.warn('download.denied', { reason, orderNumber: grant.orderNumber, ip })
    return jsonError(messageBn, status)
  }

  if (grant.revokedAt) {
    return deny('revoked', 'এই ডাউনলোডের অনুমতি বাতিল করা হয়েছে।', 403)
  }
  if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) {
    return deny('expired', 'ডাউনলোড লিংকের মেয়াদ শেষ হয়েছে।', 410)
  }
  // A refunded order loses access; a partially refunded one keeps it.
  if (grant.orderStatus === 'refunded' || grant.orderStatus === 'cancelled') {
    return deny('order_not_entitled', 'এই অর্ডারের ডাউনলোড আর সক্রিয় নেই।', 403)
  }

  // --- 3. Claim one download, atomically -----------------------------------
  // The cap is enforced by the WHERE clause, not by the count we read above,
  // so two parallel requests cannot both slip past the last allowed download.
  const claimed = await db
    .update(downloadGrants)
    .set({ downloadCount: sql`${downloadGrants.downloadCount} + 1` })
    .where(
      and(
        eq(downloadGrants.id, grant.grantId),
        or(
          isNull(downloadGrants.maxDownloads),
          sql`${downloadGrants.downloadCount} < ${downloadGrants.maxDownloads}`,
        ),
      ),
    )
    .returning({ count: downloadGrants.downloadCount })

  if (claimed.length === 0) {
    return deny('limit_reached', 'ডাউনলোডের সর্বোচ্চ সীমা শেষ হয়েছে।', 429)
  }

  // --- 4. Serve the file ---------------------------------------------------
  const fileUrl = serverEnv().EBOOK_FILE_URL
  if (!fileUrl) {
    // Deliberately NOT a placeholder file. Shipping a stub PDF to a paying
    // customer would be worse than an honest error the owner can see.
    log.error('download.file_not_configured', { orderNumber: grant.orderNumber })
    return jsonError(
      'ফাইলটি এখনো প্রস্তুত নয়। আমাদের সাথে যোগাযোগ করুন, আমরা দ্রুত পাঠিয়ে দেব।',
      503,
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(fileUrl, { cache: 'no-store' })
  } catch (err) {
    log.error('download.upstream_unreachable', { err })
    return jsonError('ফাইল সার্ভারে পৌঁছানো যাচ্ছে না। একটু পরে চেষ্টা করুন।', 502)
  }

  if (!upstream.ok || !upstream.body) {
    log.error('download.upstream_error', { status: upstream.status })
    return jsonError('ফাইলটি এখন পাওয়া যাচ্ছে না। একটু পরে চেষ্টা করুন।', 502)
  }

  await db.insert(downloadEvents).values({
    grantId: grant.grantId,
    ipAddress: ip,
    userAgent: request.headers.get('user-agent') ?? '',
    succeeded: true,
    reason: '',
  })

  log.info('download.served', { orderNumber: grant.orderNumber, count: claimed[0]?.count })

  const filename = 'ai-agent-diye-income.pdf'
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...(upstream.headers.get('content-length')
        ? { 'Content-Length': upstream.headers.get('content-length')! }
        : {}),
    },
  })
}

function jsonError(message: string, status: number, extra: Record<string, string> = {}): Response {
  return NextResponse.json({ ok: false, error: message }, { status, headers: extra })
}
