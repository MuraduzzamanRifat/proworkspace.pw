import { Pool, neonConfig } from '@neondatabase/serverless'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

import * as schema from '../src/db/schema'
import { verifyPassword } from '../src/lib/password'

/**
 * Proves the bootstrap admin can actually sign in, without a browser.
 *
 *   node --env-file=.env.local --import tsx scripts/check-admin.ts
 *
 * Reads ADMIN_BOOTSTRAP_EMAIL / _PASSWORD from the environment, finds the row,
 * and runs the real scrypt verification against the stored hash. Prints only
 * yes/no facts. Never prints the password or the hash.
 */
neonConfig.webSocketConstructor = ws

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase()
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? ''
  if (!url || !email || !password) {
    console.error('DATABASE_URL, ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must all be set.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })

  const rows = await db
    .select({
      id: schema.adminUsers.id,
      role: schema.adminUsers.role,
      isActive: schema.adminUsers.isActive,
      passwordHash: schema.adminUsers.passwordHash,
      lockedUntil: schema.adminUsers.lockedUntil,
    })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.email, email))
    .limit(1)

  const user = rows[0]
  if (!user) {
    console.log(`admin row for ${email}: MISSING`)
    await pool.end()
    process.exit(2)
  }

  const ok = await verifyPassword(password, user.passwordHash)
  console.log(`admin row for ${email}: present`)
  console.log(`role: ${user.role}   active: ${user.isActive}   locked: ${user.lockedUntil ? 'yes' : 'no'}`)
  console.log(`hash scheme: ${user.passwordHash.split('$')[0]}`)
  console.log(`bootstrap password verifies: ${ok ? 'YES' : 'NO'}`)

  const counts = await Promise.all([
    db.select().from(schema.products),
    db.select().from(schema.offers),
    db.select().from(schema.featureFlags),
    db.select().from(schema.settings),
  ])
  console.log(
    `rows — products: ${counts[0].length}, offers: ${counts[1].length}, flags: ${counts[2].length}, settings: ${counts[3].length}`,
  )

  await pool.end()
  process.exit(ok ? 0 : 3)
}

main().catch((err: unknown) => {
  console.error('check failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
