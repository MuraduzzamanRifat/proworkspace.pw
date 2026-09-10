import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import ws from 'ws'

/**
 * Apply pending migrations.
 *
 * Run with:  npm run db:migrate
 *
 * This is the ONLY supported way to change a deployed schema. `drizzle-kit
 * push` is convenient in development and destructive in production; it can
 * drop a column to reconcile a diff, and drizzle.config.ts sets strict mode
 * specifically so that cannot happen quietly.
 */
neonConfig.webSocketConstructor = ws

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Run with: npm run db:migrate')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool)

  console.log('Applying migrations from src/db/migrations ...')
  await migrate(db, { migrationsFolder: 'src/db/migrations' })
  console.log('Migrations applied.')

  await pool.end()
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
