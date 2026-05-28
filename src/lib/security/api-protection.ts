/**
 * Secure API Wrapper - Protection layer for all API routes
 * Combines auth, rate limiting, validation, and audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import {
    checkMultipleRateLimits,
    getClientIP,
    createRateLimitHeaders,
    RateLimitType,
} from '@/lib/security/rate-limiter';
import { logAuditEvent, logRateLimited, logSuspiciousActivity } from '@/lib/security/audit-logger';
import { apiSuccess, apiError } from '@/lib/api/envelope';
import { getSecurityHeaders, sanitizeError } from '@/lib/security/security-headers';

export { apiSuccess, apiError };

export interface SecureApiContext {
    userId: string;
    user: {
        id: string;
        email: string | undefined;
    };
    request: NextRequest;
    ip: string;
    supabase: SupabaseClient;
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
        const isDev = process.env.NODE_ENV === 'development';
        console.log(`[API HIT] ${request.method} ${request.nextUrl.pathname} ip=${ip}`);

        // 0. CORS origin check (production only)
        if (!isDev) {
            const origin = request.headers.get('origin');
            const allowedOrigins = [
                process.env.NEXT_PUBLIC_APP_URL,
                'https://plannrai.in',
                'https://www.plannrai.in',
                'https://plannrai.com',
                'https://www.plannrai.com',
                'https://plannr-ai.vercel.app',
                'http://localhost:3000',
                'http://localhost:3001',
            ].filter(Boolean);

            // Also allow any Vercel preview/branch deploy for this project
            const isVercelPreview = origin && /^https:\/\/plannr-ai.*\.vercel\.app$/.test(origin);

            if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin) && !isVercelPreview) {
                await logSuspiciousActivity(undefined, `Blocked cross-origin request from ${origin}`, request, {
                    endpoint: request.url,
                    origin,
                });
                return apiError('Forbidden', 403);
            }
        }
        try {
            // 1. Authentication check
            const supabase = await createClient();
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (requireAuth && (!user || authError)) {
                await logSuspiciousActivity(undefined, 'Unauthenticated API access attempt', request, {
                    endpoint: request.url,
                });

                return apiError('Unauthorized', 401);
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
                    return apiError('Invalid JSON body');
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
                supabase, // Pass the authenticated client
            };

            // 5. Execute handler
            const response = await handler(context, body);

            // 6. Apply security headers
            const secHeaders = getSecurityHeaders();
            for (const [key, value] of Object.entries(secHeaders)) {
                response.headers.set(key, value);
            }

            // 7. Log successful access
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

            // Sanitize error for production — never expose internals
            const safeMessage = sanitizeError(error, isDev);

            return apiError(safeMessage, 500);
        }
    };
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
