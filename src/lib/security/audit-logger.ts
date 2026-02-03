/**
 * Audit Logger - Security event logging for compliance and threat detection
 * Logs authentication, data access, and suspicious activity
 */

import { createClient } from '@/lib/supabase/server';

export type AuditAction =
    | 'login_success'
    | 'login_failed'
    | 'logout'
    | 'signup'
    | 'password_reset_request'
    | 'session_refresh'
    | 'data_access'
    | 'data_create'
    | 'data_update'
    | 'data_delete'
    | 'data_export'
    | 'ai_request'
    | 'rate_limited'
    | 'suspicious_activity'
    | 'ip_change'
    | 'settings_change';

export interface AuditLogEntry {
    userId?: string;
    action: AuditAction;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
    success?: boolean;
}

/**
 * Log a security audit event
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
    // Skip if logging is disabled
    if (process.env.AUDIT_LOG_ENABLED !== 'true') {
        return;
    }

    try {
        const supabase = await createClient();

        await supabase.from('security_audit_log').insert({
            user_id: entry.userId || null,
            action: entry.action,
            ip_address: entry.ipAddress || null,
            user_agent: entry.userAgent || null,
            metadata: {
                ...entry.metadata,
                success: entry.success ?? true,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        // Log to console if DB logging fails (don't block the operation)
        console.error('Audit log error:', error);
        console.log('Audit event:', JSON.stringify(entry));
    }
}

/**
 * Log authentication event
 */
export async function logAuthEvent(
    action: 'login_success' | 'login_failed' | 'logout' | 'signup',
    userId: string | undefined,
    request: Request,
    metadata?: Record<string, unknown>
): Promise<void> {
    await logAuditEvent({
        userId,
        action,
        ipAddress: getIpFromRequest(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
            ...metadata,
            method: action === 'login_failed' ? 'failed' : 'success',
        },
        success: action !== 'login_failed',
    });
}

/**
 * Log data access event
 */
export async function logDataAccess(
    userId: string,
    table: string,
    operation: 'read' | 'create' | 'update' | 'delete',
    request: Request,
    recordIds?: string[]
): Promise<void> {
    const actionMap = {
        read: 'data_access' as const,
        create: 'data_create' as const,
        update: 'data_update' as const,
        delete: 'data_delete' as const,
    };

    await logAuditEvent({
        userId,
        action: actionMap[operation],
        ipAddress: getIpFromRequest(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
            table,
            operation,
            recordCount: recordIds?.length || 1,
            recordIds: recordIds?.slice(0, 10), // Limit to first 10 IDs
        },
    });
}

/**
 * Log AI request
 */
export async function logAIRequest(
    userId: string,
    endpoint: string,
    request: Request,
    success: boolean,
    metadata?: Record<string, unknown>
): Promise<void> {
    await logAuditEvent({
        userId,
        action: 'ai_request',
        ipAddress: getIpFromRequest(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
            endpoint,
            ...metadata,
        },
        success,
    });
}

/**
 * Log rate limiting event
 */
export async function logRateLimited(
    userId: string | undefined,
    endpoint: string,
    request: Request
): Promise<void> {
    await logAuditEvent({
        userId,
        action: 'rate_limited',
        ipAddress: getIpFromRequest(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
            endpoint,
        },
        success: false,
    });
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
    userId: string | undefined,
    reason: string,
    request: Request,
    metadata?: Record<string, unknown>
): Promise<void> {
    await logAuditEvent({
        userId,
        action: 'suspicious_activity',
        ipAddress: getIpFromRequest(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
            reason,
            ...metadata,
        },
        success: false,
    });

    // Also log to console for immediate visibility
    console.warn('[SECURITY] Suspicious activity:', {
        userId,
        reason,
        ip: getIpFromRequest(request),
    });
}

/**
 * Extract IP address from request
 */
function getIpFromRequest(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    return request.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * Get recent audit logs for a user
 */
export async function getUserAuditLogs(
    userId: string,
    limit: number = 50
): Promise<unknown[]> {
    const supabase = await createClient();

    const { data } = await supabase
        .from('security_audit_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    return data || [];
}

/**
 * Check for suspicious patterns in user's recent activity
 */
export async function detectSuspiciousPatterns(
    userId: string
): Promise<{ suspicious: boolean; reasons: string[] }> {
    const supabase = await createClient();
    const reasons: string[] = [];

    // Check for multiple failed logins
    const { count: failedLogins } = await supabase
        .from('security_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('action', 'login_failed')
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()); // Last 15 min

    if (failedLogins && failedLogins > 5) {
        reasons.push('Multiple failed login attempts');
    }

    // Check for multiple rate limits
    const { count: rateLimits } = await supabase
        .from('security_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('action', 'rate_limited')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

    if (rateLimits && rateLimits > 10) {
        reasons.push('Excessive rate limiting');
    }

    return {
        suspicious: reasons.length > 0,
        reasons,
    };
}
