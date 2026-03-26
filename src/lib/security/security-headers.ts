/**
 * Security Headers - Centralized security header configuration
 * Applied to all API responses and pages
 */

export function getSecurityHeaders(): Record<string, string> {
    return {
        // Prevent MIME type sniffing
        'X-Content-Type-Options': 'nosniff',

        // Prevent clickjacking
        'X-Frame-Options': 'DENY',

        // XSS Protection (legacy browsers)
        'X-XSS-Protection': '1; mode=block',

        // Referrer Policy — don't leak full URL to external sites
        'Referrer-Policy': 'strict-origin-when-cross-origin',

        // Permissions Policy — disable unused browser features
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',

        // Prevent DNS prefetching to external domains
        'X-DNS-Prefetch-Control': 'off',
    };
}

/**
 * Apply security headers to a Response/NextResponse
 */
export function applySecurityHeaders(response: Response): Response {
    const headers = getSecurityHeaders();
    for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
    }
    return response;
}

/**
 * Sanitize error messages for production
 * Strips stack traces, internal paths, and sensitive info
 */
export function sanitizeError(error: unknown, isDev: boolean): string {
    if (isDev) {
        return error instanceof Error ? error.message : String(error);
    }

    // In production: never expose internal details
    return 'An internal error occurred. Please try again.';
}
