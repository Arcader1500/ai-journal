/**
 * In-memory rate limiter with exponential backoff.
 *
 * Works per-user per-endpoint. Resets on cold start — acceptable for
 * Vercel Hobby (single instance per region). Not shared across instances.
 */

interface RateLimitEntry {
  /** Request count in the current window */
  count: number
  /** When the current window opened (ms since epoch) */
  windowStart: number
  /** How many times this user has exceeded the limit (for backoff calculation) */
  violations: number
  /** Timestamp (ms) until which the user is blocked */
  backoffUntil: number
}

type Endpoint = 'chat' | 'synthesize'

const LIMITS: Record<Endpoint, { max: number; windowMs: number }> = {
  chat:       { max: 30, windowMs: 60_000 },   // 30 req / 60s
  synthesize: { max: 5,  windowMs: 60_000 },   // 5  req / 60s
}

const BACKOFF_BASE_MS = 5_000   // 5 seconds base
const BACKOFF_MAX_MS  = 300_000 // 5 minutes cap

const store = new Map<string, RateLimitEntry>()

/**
 * Check and record a request for the given userId+endpoint.
 * Returns null if the request is allowed, or a { retryAfterSeconds } object if blocked.
 */
export function checkRateLimit(
  userId: string,
  endpoint: Endpoint
): { retryAfterSeconds: number } | null {
  const key = `${userId}:${endpoint}`
  const { max, windowMs } = LIMITS[endpoint]
  const now = Date.now()

  let entry = store.get(key)

  // Initialise on first request
  if (!entry) {
    entry = { count: 1, windowStart: now, violations: 0, backoffUntil: 0 }
    store.set(key, entry)
    return null
  }

  // Still in backoff window?
  if (now < entry.backoffUntil) {
    const retryAfterSeconds = Math.ceil((entry.backoffUntil - now) / 1000)
    return { retryAfterSeconds }
  }

  // New sliding window
  if (now - entry.windowStart > windowMs) {
    entry.count = 1
    entry.windowStart = now
    return null
  }

  entry.count++

  if (entry.count > max) {
    // Exponential backoff: 5s × 2^violations, capped at 5min
    const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, entry.violations), BACKOFF_MAX_MS)
    entry.violations++
    entry.backoffUntil = now + backoffMs
    const retryAfterSeconds = Math.ceil(backoffMs / 1000)
    return { retryAfterSeconds }
  }

  return null
}
