/**
 * Money.
 *
 * Every amount in this system is an integer number of poisha (1/100 BDT).
 * Floating point never touches a price. `0.1 + 0.2 !== 0.3` is not an
 * acceptable failure mode for a payment total.
 *
 * The gateway wants a decimal string in taka ("1990" or "1990.00"), so the
 * conversion happens once, at the boundary, in `toGatewayAmount`.
 */

export type Poisha = number & { readonly __brand: unique symbol }

const POISHA_PER_TAKA = 100

/** Construct a Poisha value, rejecting anything that is not a safe integer. */
export function poisha(value: number): Poisha {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Amount must be an integer number of poisha, got ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Amount is outside the safe integer range: ${value}`)
  }
  if (value < 0) {
    throw new RangeError(`Amount must not be negative, got ${value}`)
  }
  return value as Poisha
}

/** Convert whole taka to poisha. Rejects fractional taka beyond 2 decimals. */
export function taka(amount: number): Poisha {
  const scaled = Math.round(amount * POISHA_PER_TAKA)
  if (Math.abs(amount * POISHA_PER_TAKA - scaled) > 1e-6) {
    throw new RangeError(`Taka amount has sub-poisha precision: ${amount}`)
  }
  return poisha(scaled)
}

export function add(a: Poisha, b: Poisha): Poisha {
  return poisha(a + b)
}

/** Saturating subtraction. A discount can never drive a total below zero. */
export function subtractFloorZero(a: Poisha, b: Poisha): Poisha {
  return poisha(Math.max(0, a - b))
}

/**
 * Percentage of an amount, rounded half-up to the nearest poisha.
 *
 * Half-up rather than banker's rounding because that is what a Bangladeshi
 * customer reading a 15% discount on ৳1,990 expects to see, and consistency
 * with the displayed number matters more here than statistical neutrality.
 */
export function percentOf(amount: Poisha, percent: number): Poisha {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`Percent must be between 0 and 100, got ${percent}`)
  }
  return poisha(Math.round((amount * percent) / 100))
}

/** Decimal taka string for the payment gateway, always 2 decimal places. */
export function toGatewayAmount(amount: Poisha): string {
  const whole = Math.floor(amount / POISHA_PER_TAKA)
  const frac = amount % POISHA_PER_TAKA
  return `${whole}.${String(frac).padStart(2, '0')}`
}

/** Parse a gateway decimal-taka string back to poisha, for verification. */
export function fromGatewayAmount(value: string): Poisha {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new RangeError(`Unparseable gateway amount: ${JSON.stringify(value)}`)
  }
  const [wholePart, fracPart = ''] = trimmed.split('.')
  const frac = fracPart.padEnd(2, '0')
  return poisha(Number(wholePart) * POISHA_PER_TAKA + Number(frac))
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const

/** Render Western digits as Bengali digits. Non-digits pass through. */
export function toBengaliDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const code = ch.charCodeAt(0) - 48
    out += code >= 0 && code <= 9 ? BENGALI_DIGITS[code]! : ch
  }
  return out
}

/**
 * Display an amount for the customer: "৳১,৯৯০".
 *
 * Grouping is the South Asian 2-2-3 lakh/crore system, not Western thousands,
 * because the audience is Bangladeshi. 100000 renders as ১,০০,০০০.
 * Poisha are shown only when non-zero.
 */
export function formatBdt(amount: Poisha, opts: { bengali?: boolean } = {}): string {
  const bengali = opts.bengali ?? true
  const whole = Math.floor(amount / POISHA_PER_TAKA)
  const frac = amount % POISHA_PER_TAKA

  const digits = String(whole)
  let grouped: string
  if (digits.length <= 3) {
    grouped = digits
  } else {
    const last3 = digits.slice(-3)
    const rest = digits.slice(0, -3)
    // Group the remainder in pairs from the right: 12,34,567
    const pairs = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    grouped = `${pairs},${last3}`
  }

  let body = grouped
  if (frac !== 0) body += `.${String(frac).padStart(2, '0')}`

  const withSymbol = `৳${body}`
  return bengali ? toBengaliDigits(withSymbol) : withSymbol
}
