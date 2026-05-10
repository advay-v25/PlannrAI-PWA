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
    ai: { windowMs: 60 * 1000, maxRequests: 20 },       // 20 req/min for AI
    // AI burst protection (prevent rapid-fire abuse)
    aiBurst: { windowMs: 10 * 1000, maxRequests: 5 },   // 5 req/10s for AI

    // Brain dump (less strict)
    brainDump: { windowMs: 60 * 1000, maxRequests: 10 },
} as const;

export type RateLimitType = keyof typeof LIMITS;

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfter?: number;
}

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(
    key: string,
    type: RateLimitType = 'ip'
): RateLimitResult {
    const config = LIMITS[type];
    const now = Date.now();
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
    };
}

/**
 * Create a composite rate limit key
 */
export function createRateLimitKey(
    type: 'ip' | 'user' | 'endpoint',
    identifier: string,
    endpoint?: string
): string {
    if (type === 'endpoint' && endpoint) {
        return `${type}:${identifier}:${endpoint}`;
    }
    return `${type}:${identifier}`;
}

/**
 * Check multiple rate limits (IP + User + Endpoint)
 */
export function checkMultipleRateLimits(
    ip: string,
    userId?: string,
    endpoint?: string,
    endpointType?: RateLimitType
): RateLimitResult {
    // Check IP limit first
    const ipKey = createRateLimitKey('ip', ip);
    const ipResult = checkRateLimit(ipKey, 'ip');
    if (!ipResult.allowed) {
        return ipResult;
    }

    // Check user limit if authenticated
    if (userId) {
        const userKey = createRateLimitKey('user', userId);
        const userResult = checkRateLimit(userKey, 'user');
        if (!userResult.allowed) {
            return userResult;
        }
    }

    // Check endpoint-specific limit
    if (endpoint && endpointType) {
        const endpointKey = createRateLimitKey('endpoint', ip, endpoint);
        const endpointResult = checkRateLimit(endpointKey, endpointType);
        if (!endpointResult.allowed) {
            return endpointResult;
        }
        return endpointResult;
    }

    return ipResult;
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
    // Check common headers for proxied requests
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    // Fallback (may not work in all environments)
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
