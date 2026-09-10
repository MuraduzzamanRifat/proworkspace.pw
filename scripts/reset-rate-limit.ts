import { Pool, neonConfig } from '@neondatabase/serverless'
import { like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

import * as schema from '../src/db/schema'

/**
 * Clear rate-limit counters by key prefix.
 *
 *   node --env-file=.env.local --import tsx scripts/reset-rate-limit.ts admin-login:
 *   node --env-file=.env.local --import tsx scripts/reset-rate-limit.ts checkout:203.0.113.5
 *
 * The operator's escape hatch when a legitimate person (or a test run) has
 * tripped a limiter. Rows are counters only; deleting them loses nothing
 * but the current window's count.
 */
neonConfig.webSocketConstructor = ws

async function main(): Promise<void> {
  const prefix = (process.argv[2] ?? '').trim()
  const url = process.env.DATABASE_URL
  if (!prefix || !url) {
    console.error('usage: reset-rate-limit.ts <key-prefix>   (DATABASE_URL must be set)')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })
  const deleted = await db
    .delete(schema.rateLimits)
    .where(like(schema.rateLimits.key, `${prefix}%`))
    .returning({ key: schema.rateLimits.key })
  console.log(`cleared ${deleted.length} counter(s) with prefix "${prefix}"`)
  for (const d of deleted) console.log(`  ${d.key}`)
  await pool.end()
}

main().catch((err: unknown) => {
  console.error('failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
