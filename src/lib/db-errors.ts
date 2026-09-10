/**
 * PostgreSQL error helpers.
 *
 * Idempotency in this system is enforced by unique constraints rather than by
 * "SELECT then INSERT", which races. That means the happy path for a duplicate
 * is *catching* a constraint violation, so recognising one precisely matters.
 */

/** 23505 = unique_violation. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown }
  if (e.code !== '23505') return false
  if (!constraint) return true
  if (typeof e.constraint === 'string' && e.constraint === constraint) return true
  // Some drivers surface the constraint only inside the message text.
  return typeof e.message === 'string' && e.message.includes(constraint)
}

/** 23503 = foreign_key_violation. */
export function isForeignKeyViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  return (err as { code?: unknown }).code === '23503'
}

/** 40001 = serialization_failure, 40P01 = deadlock_detected. Both are retryable. */
export function isRetryableTransactionError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: unknown }).code
  return code === '40001' || code === '40P01'
}
