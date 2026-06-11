import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Checks if the user is within their rate limit.
 * 
 * @param key - A unique identifier for the limit (e.g. `user_id:feature`)
 * @param limit - Maximum number of requests allowed in the window
 * @param windowSeconds - The time window in seconds
 * @returns true if allowed, false if limit exceeded
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc('check_rate_limit', {
            p_key: key,
            p_limit: limit,
            p_window_interval: `${windowSeconds} seconds`
        });

        if (error) {
            console.error('[RateLimit] Error checking limit via RPC:', error);
            // Fail open to avoid breaking the application on DB errors
            return true;
        }

        return data as boolean;
    } catch (e) {
        console.error('[RateLimit] Exception during check:', e);
        return true;
    }
}

/**
 * Wrapper for API routes that throws a 429 response if rate limit is exceeded.
 * Usage:
 * const isAllowed = await requireRateLimit(`generate-today:${user.id}`, 5, 600);
 * if (isAllowed instanceof NextResponse) return isAllowed;
 * 
 * @param key The limit key
 * @param limit Number of allowed requests
 * @param windowSeconds Time window
 * @returns true if allowed, or a NextResponse (429) if blocked.
 */
export async function requireRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean | NextResponse> {
    const isAllowed = await checkRateLimit(key, limit, windowSeconds);
    if (!isAllowed) {
        return NextResponse.json(
            { error: 'Too many requests. Please wait before trying again.', rate_limited: true },
            { status: 429 }
        );
    }
    return true;
}
