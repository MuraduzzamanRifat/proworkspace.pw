import type { Config } from 'drizzle-kit'

/**
 * drizzle-kit reads this directly with its own loader, outside Next.js, so it
 * cannot use the `@/` path alias and must read process.env itself.
 */
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Never let `drizzle-kit push` silently drop a column on a production
  // database. Destructive changes go through a reviewed migration file.
  strict: true,
  verbose: true,
} satisfies Config
