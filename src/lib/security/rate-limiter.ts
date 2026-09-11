/**
 * Rate Limiter - Multi-layer protection against abuse
 * Uses in-memory storage with sliding window algorithm
 */

interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// In-memory store (for single instance - use Redis for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Default limits
const LIMITS = {
    // Per IP limits
    ip: { windowMs: 60 * 1000, maxRequests: 200 },       // 200 req/min per IP (unauthenticated)
    ipStrict: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 req/min for auth endpoints

    // Per user limits
    user: { windowMs: 60 * 1000, maxRequests: 500 },    // 500 req/min per authenticated user

    // AI endpoint limits (protect API keys)
    aiPlanDay: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 200 }, // 200 req/day
    aiCoach: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 500 },  // 500 req/day
    aiPlanWeek: { windowMs: 7 * 24 * 60 * 60 * 1000, maxRequests: 10 }, // 10 req/week
    ai: { windowMs: 60 * 1000, maxRequests: 20 },       // 20 req/min for general AI
    // AI burst protection (prevent rapid-fire abuse)
    aiBurst: { windowMs: 10 * 1000, maxRequests: 5 },   // 5 req/10s for AI

    // Preview Feature Limits (to control costs)
    aiWeeklyReview: { windowMs: 7 * 24 * 60 * 60 * 1000, maxRequests: 5000 }, // 5000 req/week
    aiHabits: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 5000 }, // 5000 req/day
    aiStrategy: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 5000 }, // 5000 req/day
    
    // Default user strict for generic supbase DB writes/reads
    userStrict: { windowMs: 60 * 1000, maxRequests: 100 },

    // Data action limits
    dataExport: { windowMs: 7 * 24 * 60 * 60 * 1000, maxRequests: 5 }, // 5 req/week

    // Auth specific limits
    authLogin: { windowMs: 15 * 60 * 1000, maxRequests: 5000 }, // 5000 login attempts per 15 mins
    authEmail: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 2 }, // 2 reset/signup emails per 24 hours
} as const;

export type RateLimitType = keyof typeof LIMITS;

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfter?: number;
    /** WHICH limiter refused, so the 429 can name it instead of guessing. */
    limiter?: RateLimitType;
    /** That limiter's ceiling and window, for the message and the logs. */
    limit?: number;
    windowMs?: number;
}

/**
 * Check rate limit for a given key
 */
export async function checkRateLimit(
    key: string,
    type: RateLimitType = 'ip'
): Promise<RateLimitResult> {
    const config = LIMITS[type];
    const now = Date.now();

    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (process.env.NODE_ENV === 'production' && (!upstashUrl || !upstashToken)) {
        throw new Error('Upstash Redis is REQUIRED in production. Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN.');
    }
    
    if (upstashUrl && upstashToken) {
        try {
            const ttlSeconds = Math.ceil(config.windowMs / 1000);

            // INCR and EXPIRE in ONE pipeline.
            //
            // EXPIRE used to be a separate GET with the key interpolated into
            // the URL PATH: `${url}/EXPIRE/${key}/${seconds}`. Endpoint keys
            // contain the route — `endpoint:<uid>:/api/goals` — so the slashes
            // became path separators and the command was malformed. The EXPIRE
            // silently failed, the key was created with NO TTL, and the counter
            // then climbed forever.
            //
            // Measured on the live instance: 241 keys with `ttl=-1`, including
            // `endpoint:<user>:/api/goals` at **511** against a 500/min ceiling.
            // That user's goals page was permanently 429 and would never have
            // recovered on its own. `ip:` and `user:` keys were fine only
            // because they happen to contain no slashes.
            //
            // The pipeline body is JSON, so arguments are transmitted verbatim
            // and cannot be re-parsed as a path.
            const resp = await fetch(`${upstashUrl}/pipeline`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify([
                    ['INCR', key],
                    ['EXPIRE', key, String(ttlSeconds), 'NX'], // NX: only if no TTL yet
                    ['PTTL', key],
                ]),
            });
            const result = await resp.json();

            let count = 1;
            let pttl = config.windowMs;
            if (Array.isArray(result)) {
                if (result[0] && !result[0].error) count = result[0].result;
                if (result[2] && !result[2].error && result[2].result > 0) pttl = result[2].result;
            }

            if (count <= config.maxRequests) {
                return {
                    allowed: true,
                    remaining: config.maxRequests - count,
                    resetAt: new Date(now + pttl),
                };
            }

            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(now + pttl),
                retryAfter: Math.ceil(pttl / 1000),
                limiter: type,
                limit: config.maxRequests,
                windowMs: config.windowMs,
            };
        } catch (error) {
            console.error("Upstash Redis error, falling back to Map:", error);
        }
    }

    const entry = rateLimitStore.get(key);

    // Clean up expired entries periodically
    if (Math.random() < 0.01) {
        cleanupExpiredEntries();
    }

    // No existing entry or window expired
    if (!entry || now > entry.resetAt) {
        const newEntry: RateLimitEntry = {
            count: 1,
            resetAt: now + config.windowMs,
        };
        rateLimitStore.set(key, newEntry);

        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetAt: new Date(newEntry.resetAt),
        };
    }

    // Within window
    if (entry.count < config.maxRequests) {
        entry.count++;
        rateLimitStore.set(key, entry);

        return {
            allowed: true,
            remaining: config.maxRequests - entry.count,
            resetAt: new Date(entry.resetAt),
        };
    }

    // Rate limited
    return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        limiter: type,
        limit: config.maxRequests,
        windowMs: config.windowMs,
    };
}

/**
 * Create a composite rate limit key
 */
/**
 * Keys are namespaced by environment. Without this, `.env.local` points local
 * development at the SAME Upstash instance as production, so a developer
 * reloading a page consumes a real user's budget and vice versa. Confirmed on
 * the live instance: 243 keys, none prefixed.
 */
export const RATE_LIMIT_ENV =
    process.env.RATE_LIMIT_NAMESPACE ||
    (process.env.NODE_ENV === 'production' ? 'prod' : 'dev');

export function createRateLimitKey(
    type: 'ip' | 'user' | 'endpoint',
    identifier: string,
    endpoint?: string
): string {
    const base =
        type === 'endpoint' && endpoint
            ? `${type}:${identifier}:${endpoint}`
            : `${type}:${identifier}`;
    return `${RATE_LIMIT_ENV}:${base}`;
}

/** Loopback, where every local request shares one key. */
function isLocalhost(ip: string): boolean {
    return ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' || ip === '::ffff:127.0.0.1';
}

/**
 * Check multiple rate limits (IP + User + Endpoint)
 */
export async function checkMultipleRateLimits(
    ip: string,
    userId?: string,
    endpoint?: string,
    endpointType?: RateLimitType
): Promise<RateLimitResult> {
    // §2: the per-USER limit governs an authenticated request; the IP ceiling
    // exists to stop UNauthenticated abuse.
    //
    // Checking IP first meant one identity capped the entire application at 200
    // requests a minute across every endpoint. In local development every
    // request arrives from ::1, so that was a single budget for the whole app —
    // and one page load costs eight or more requests.
    if (userId) {
        const userResult = await checkRateLimit(createRateLimitKey('user', userId), 'user');
        if (!userResult.allowed) return userResult;
    } else if (!(isLocalhost(ip) && process.env.NODE_ENV !== 'production')) {
        // Anonymous traffic still faces the IP ceiling — except on loopback in
        // development, where HMR and React StrictMode double-mounting make the
        // production number meaningless.
        const ipResult = await checkRateLimit(createRateLimitKey('ip', ip), 'ip');
        if (!ipResult.allowed) return ipResult;
    }

    // Check endpoint-specific limit
    if (endpoint && endpointType) {
        let endpointKey = createRateLimitKey('endpoint', userId || ip, endpoint);
        
        const isWeeklyReset = endpointType === 'aiPlanWeek' || endpointType === 'aiWeeklyReview' || endpointType === 'dataExport';
        const isDailyReset = endpointType === 'aiPlanDay' || endpointType === 'aiCoach' || endpointType === 'aiHabits' || endpointType === 'aiStrategy';

        if (isWeeklyReset) {
            const now = new Date();
            const day = now.getUTCDay();
            const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
            endpointKey = `${endpointKey}:${monday.toISOString().split('T')[0]}`;
        } else if (isDailyReset) {
            const now = new Date();
            const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            endpointKey = `${endpointKey}:${today.toISOString().split('T')[0]}`;
        }
        
        const endpointResult = await checkRateLimit(endpointKey, endpointType);
        
        if (!endpointResult.allowed) {
            if (isWeeklyReset) {
                const now = new Date();
                const day = now.getUTCDay();
                const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
                const nextMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilNextMonday));
                
                endpointResult.resetAt = nextMonday;
                endpointResult.retryAfter = Math.ceil((nextMonday.getTime() - Date.now()) / 1000);
            } else if (isDailyReset) {
                const now = new Date();
                const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
                
                endpointResult.resetAt = nextMidnight;
                endpointResult.retryAfter = Math.ceil((nextMidnight.getTime() - Date.now()) / 1000);
            }
            return endpointResult;
        }

        return endpointResult;
    }

    // Nothing refused it.
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetAt: new Date(Date.now() + 60_000) };
}

/**
 * Clean up expired entries to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetAt) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
    // Check Vercel's trusted IP header first
    const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
    if (vercelForwarded) {
        return vercelForwarded.split(',')[0].trim();
    }

    // Check common headers for proxied requests
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    // Fallback to local IP if no headers are present
    return '127.0.0.1';
}

/**
 * Create rate limit headers for response
 */
export function createRateLimitHeaders(result: RateLimitResult): Headers {
    const headers = new Headers();
    headers.set('X-RateLimit-Remaining', result.remaining.toString());
    headers.set('X-RateLimit-Reset', result.resetAt.toISOString());

    if (!result.allowed && result.retryAfter) {
        headers.set('Retry-After', result.retryAfter.toString());
    }

    return headers;
}
