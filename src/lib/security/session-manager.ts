/**
 * Session Manager - Secure session handling and hijacking detection
 */

import { createClient } from '@/lib/supabase/server';
import { hash } from '@/lib/security/encryption';
import { logSuspiciousActivity } from '@/lib/security/audit-logger';

const MAX_SESSIONS_PER_USER = 5;

/**
 * Create a session binding for hijacking detection
 */
export async function bindSession(
    userId: string,
    sessionId: string,
    request: Request
): Promise<void> {
    const supabase = await createClient();

    const ip = getIpFromRequest(request);
    const userAgent = request.headers.get('user-agent') || '';
    const userAgentHash = await hash(userAgent);
    const sessionHash = await hash(sessionId);

    // Check existing sessions
    const { data: existingSessions } = await supabase
        .from('session_bindings')
        .select('id')
        .eq('user_id', userId)
        .eq('is_valid', true)
        .order('created_at', { ascending: true });

    // Invalidate oldest sessions if over limit
    if (existingSessions && existingSessions.length >= MAX_SESSIONS_PER_USER) {
        const sessionsToInvalidate = existingSessions
            .slice(0, existingSessions.length - MAX_SESSIONS_PER_USER + 1)
            .map(s => s.id);

        await supabase
            .from('session_bindings')
            .update({ is_valid: false })
            .in('id', sessionsToInvalidate);
    }

    // Create new binding
    await supabase.from('session_bindings').insert({
        user_id: userId,
        session_hash: sessionHash,
        ip_address: ip,
        user_agent_hash: userAgentHash,
    });
}

/**
 * Verify session binding - detect potential hijacking
 */
export async function verifySessionBinding(
    userId: string,
    sessionId: string,
    request: Request
): Promise<{ valid: boolean; reason?: string }> {
    const supabase = await createClient();

    const sessionHash = await hash(sessionId);

    const { data: binding } = await supabase
        .from('session_bindings')
        .select('*')
        .eq('user_id', userId)
        .eq('session_hash', sessionHash)
        .eq('is_valid', true)
        .single();

    if (!binding) {
        return { valid: false, reason: 'Session not found' };
    }

    const currentIp = getIpFromRequest(request);
    const currentUserAgent = request.headers.get('user-agent') || '';
    const currentUserAgentHash = await hash(currentUserAgent);

    // Check for IP change (might be legitimate - VPN, mobile)
    if (binding.ip_address !== currentIp) {
        // Log but don't block - IP changes are common
        console.log('Session IP changed:', { userId, oldIp: binding.ip_address, newIp: currentIp });
    }

    // Check for user agent change (more suspicious)
    if (binding.user_agent_hash !== currentUserAgentHash) {
        await logSuspiciousActivity(userId, 'User agent changed mid-session', request, {
            sessionId: sessionHash.slice(0, 8) + '...',
        });

        // Still allow but flag it
        console.warn('Session user agent changed:', { userId });
    }

    // Update last seen
    await supabase
        .from('session_bindings')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', binding.id);

    return { valid: true };
}

/**
 * Invalidate all sessions for a user (forced logout)
 */
export async function invalidateAllSessions(userId: string): Promise<void> {
    const supabase = await createClient();

    await supabase
        .from('session_bindings')
        .update({ is_valid: false })
        .eq('user_id', userId);
}

/**
 * Get active session count for a user
 */
export async function getActiveSessionCount(userId: string): Promise<number> {
    const supabase = await createClient();

    const { count } = await supabase
        .from('session_bindings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_valid', true);

    return count || 0;
}

/**
 * Extract IP from request headers
 */
function getIpFromRequest(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return request.headers.get('x-real-ip') || '127.0.0.1';
}
