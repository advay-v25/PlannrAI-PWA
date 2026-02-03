import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Security headers for defense in depth
const SECURITY_HEADERS = {
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',

    // Prevent MIME sniffing
    'X-Content-Type-Options': 'nosniff',

    // XSS protection
    'X-XSS-Protection': '1; mode=block',

    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions policy (disable unused features)
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',

    // HSTS (only in production)
    ...(process.env.NODE_ENV === 'production' && {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    }),

    // Content Security Policy
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Required for Next.js
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; '),
};

export default async function proxy(request: NextRequest) {
    // Update Supabase session
    const response = await updateSession(request);

    // Add security headers to response
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        if (value) {
            response.headers.set(key, value);
        }
    }

    // Block suspicious request patterns
    const url = request.nextUrl;
    const suspiciousPatterns = [
        /\.(php|asp|aspx|jsp)$/i,
        /\/wp-admin/i,
        /\/wp-content/i,
        /\/xmlrpc/i,
        /\.env$/i,
        /\/\.git/i,
        /\/\.svn/i,
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(url.pathname))) {
        return new NextResponse('Not Found', { status: 404 });
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
