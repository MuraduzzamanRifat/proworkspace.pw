import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless'

import { serverEnv } from '@/config/env'
import * as schema from './schema'

/**
 * Database handle.
 *
 * Driver choice: `neon-serverless` (WebSocket Pool), not `neon-http`.
 *
 * The HTTP driver is faster for one-shot queries but cannot open a
 * transaction, and order creation is not a one-shot query — it writes an
 * order, its item snapshot and a payment row, and a partial write there is a
 * customer who paid for a row that does not exist. Correctness wins.
 *
 * Node 20 has no global WebSocket (that arrived in Node 22), so the `ws`
 * implementation is injected when one is absent. On an edge runtime the
 * platform's own WebSocket is already global and this is skipped.
 */
if (typeof globalThis.WebSocket === 'undefined') {
  // Synchronous require keeps this out of the edge bundle's async graph.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor = require('ws')
}

export type Database = NeonDatabase<typeof schema>

/**
 * Cached across hot reloads in development. Without this, every edit opens a
 * new pool and Neon starts refusing connections after a few dozen saves.
 */
const globalForDb = globalThis as unknown as {
  __ebookFunnelPool?: Pool
  __ebookFunnelDb?: Database
}

function createPool(): Pool {
  const url = serverEnv().DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.',
    )
  }
  return new Pool({ connectionString: url })
}

export function getDb(): Database {
  if (!globalForDb.__ebookFunnelDb) {
    const pool = globalForDb.__ebookFunnelPool ?? createPool()
    globalForDb.__ebookFunnelPool = pool
    globalForDb.__ebookFunnelDb = drizzle(pool, { schema })
  }
  return globalForDb.__ebookFunnelDb
}

export { schema }
