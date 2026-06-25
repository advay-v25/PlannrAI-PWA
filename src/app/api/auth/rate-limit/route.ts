import { NextResponse } from 'next/server';
import { checkMultipleRateLimits, getClientIP, RateLimitType } from '@/lib/security/rate-limiter';
import { logRateLimited } from '@/lib/security/audit-logger';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, email } = body; // action: 'login', 'signup', 'forgot_password', 'oauth'
        
        const ip = getClientIP(request);
        let endpointType: RateLimitType = 'authLogin';
        
        if (action === 'signup' || action === 'forgot_password') {
            endpointType = 'authEmail';
        }

        // We use the email (if provided) or IP as the identifier
        // If an email is provided, we still want to rate limit by IP to prevent bots from cycling emails
        const ipResult = await checkMultipleRateLimits(ip, undefined, `auth_${action}`, endpointType);
        
        if (!ipResult.allowed) {
            await logRateLimited(undefined, `/api/auth/${action}`, request);
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { 
                    status: 429,
                    headers: {
                        'Retry-After': (ipResult.retryAfter || 60).toString(),
                        'X-RateLimit-Reset': ipResult.resetAt.toISOString(),
                    }
                }
            );
        }

        return NextResponse.json({ success: true, allowed: true });
    } catch (error) {
        console.error('[Rate Limit API Error]:', error);
        // Fail open if rate limiter fails
        return NextResponse.json({ success: true, allowed: true });
    }
}
