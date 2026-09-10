import { Pool, neonConfig } from '@neondatabase/serverless'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

import * as schema from '../src/db/schema'

/**
 * Activate or deactivate an admin account.
 *
 *   node --env-file=.env.local --import tsx scripts/admin-set-active.ts <email> <true|false>
 *
 * Deactivation rather than deletion: the row stays for the audit trail, and
 * `getCurrentAdmin` refuses inactive accounts immediately, so any live session
 * for that user stops working on its next request.
 */
neonConfig.webSocketConstructor = ws

async function main(): Promise<void> {
  const [emailArg, activeArg] = process.argv.slice(2)
  const email = (emailArg ?? '').trim().toLowerCase()
  if (!email || (activeArg !== 'true' && activeArg !== 'false')) {
    console.error('usage: admin-set-active.ts <email> <true|false>')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })

  const updated = await db
    .update(schema.adminUsers)
    .set({ isActive: activeArg === 'true', updatedAt: new Date() })
    .where(eq(schema.adminUsers.email, email))
    .returning({ email: schema.adminUsers.email, isActive: schema.adminUsers.isActive })

  if (updated.length === 0) {
    console.log(`no admin with email ${email}`)
    await pool.end()
    process.exit(2)
  }

  await db.insert(schema.auditLogs).values({
    actorId: null,
    actorEmail: 'scripts/admin-set-active',
    action: activeArg === 'true' ? 'admin.activated' : 'admin.deactivated',
    entityType: 'admin_user',
    entityId: email,
  })

  const all = await db
    .select({ email: schema.adminUsers.email, role: schema.adminUsers.role, isActive: schema.adminUsers.isActive })
    .from(schema.adminUsers)
  console.log(`${updated[0]!.email} -> active=${updated[0]!.isActive}`)
  console.log('all admins:')
  for (const a of all) console.log(`  ${a.email}  ${a.role}  active=${a.isActive}`)

  await pool.end()
}

main().catch((err: unknown) => {
  console.error('failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
