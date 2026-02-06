/**
 * Secure API Wrapper - Protection layer for all API routes
 * Combines auth, rate limiting, validation, and audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    checkMultipleRateLimits,
    getClientIP,
    createRateLimitHeaders,
    RateLimitType,
} from '@/lib/security/rate-limiter';
import { logAuditEvent, logRateLimited, logSuspiciousActivity } from '@/lib/security/audit-logger';

export interface SecureApiContext {
    userId: string;
    user: {
        id: string;
        email: string | undefined;
    };
    request: NextRequest;
    ip: string;
}

export type SecureApiHandler = (
    context: SecureApiContext,
    body: unknown
) => Promise<NextResponse>;

export interface SecureApiOptions {
    // Require authentication
    requireAuth?: boolean;

    // Rate limit type for this endpoint
    rateLimit?: RateLimitType;

    // Audit log action name
    auditAction?: string;

    // Skip rate limiting (not recommended)
    skipRateLimit?: boolean;
}

/**
 * Wrap an API handler with security protections
 */
export function secureApiRoute(
    handler: SecureApiHandler,
    options: SecureApiOptions = {}
): (request: NextRequest) => Promise<NextResponse> {
    const {
        requireAuth = true,
        rateLimit = 'user',
        auditAction,
        skipRateLimit = false,
    } = options;

    return async (request: NextRequest): Promise<NextResponse> => {
        const ip = getClientIP(request);

        try {
            // 1. Authentication check
            const supabase = await createClient();
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (requireAuth && (!user || authError)) {
                await logSuspiciousActivity(undefined, 'Unauthenticated API access attempt', request, {
                    endpoint: request.url,
                });

                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                );
            }

            // 2. Rate limiting
            if (!skipRateLimit) {
                const rateLimitResult = checkMultipleRateLimits(
                    ip,
                    user?.id,
                    request.nextUrl.pathname,
                    rateLimit
                );

                if (!rateLimitResult.allowed) {
                    await logRateLimited(user?.id, request.nextUrl.pathname, request);

                    const headers = createRateLimitHeaders(rateLimitResult);

                    return new NextResponse(
                        JSON.stringify({ error: 'Too many requests. Please slow down.' }),
                        {
                            status: 429,
                            headers: {
                                'Content-Type': 'application/json',
                                ...Object.fromEntries(headers.entries()),
                            },
                        }
                    );
                }
            }

            // 3. Parse request body
            let body: unknown = null;

            if (request.method !== 'GET' && request.method !== 'HEAD') {
                try {
                    const text = await request.text();
                    if (text) {
                        body = JSON.parse(text);
                    }
                } catch {
                    return NextResponse.json(
                        { error: 'Invalid JSON body' },
                        { status: 400 }
                    );
                }
            }

            // 4. Create secure context
            const context: SecureApiContext = {
                userId: user?.id || '',
                user: {
                    id: user?.id || '',
                    email: user?.email,
                },
                request,
                ip,
            };

            // 5. Execute handler
            const response = await handler(context, body);

            // 6. Log successful access
            if (auditAction) {
                await logAuditEvent({
                    userId: user?.id,
                    action: 'data_access',
                    ipAddress: ip,
                    userAgent: request.headers.get('user-agent') || undefined,
                    metadata: {
                        endpoint: request.nextUrl.pathname,
                        action: auditAction,
                    },
                    success: response.status < 400,
                });
            }

            return response;

        } catch (error) {
            console.error('API error:', error);

            // Log error
            await logSuspiciousActivity(undefined, 'API error', request, {
                endpoint: request.url,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            // Never expose internal errors
            return NextResponse.json(
                { error: 'An unexpected error occurred' },
                { status: 500 }
            );
        }
    };
}

/**
 * Create standard API error response
 */
export function apiError(
    message: string,
    status: number = 400,
    details?: unknown
): NextResponse {
    return NextResponse.json({ error: message, details }, { status });
}

/**
 * Create standard API success response
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
    return NextResponse.json(data, { status });
}

/**
 * Validate required fields in request body
 */
export function validateRequiredFields(
    body: unknown,
    fields: string[]
): { valid: boolean; missing: string[] } {
    if (!body || typeof body !== 'object') {
        return { valid: false, missing: fields };
    }

    const missing = fields.filter(
        (field) => !(field in body) || (body as Record<string, unknown>)[field] === undefined
    );

    return { valid: missing.length === 0, missing };
}
