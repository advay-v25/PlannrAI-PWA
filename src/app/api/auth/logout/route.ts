import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const POST = secureApiRoute(async (context) => {
    const { supabase } = context;
    await supabase.auth.signOut();

    // Create response that redirects and clears all Supabase SSR cookies
    const response = apiSuccess({ success: true });

    // Clear all possible Supabase cookie variants
    const cookieNames = [
        'sb-access-token',
        'sb-refresh-token',
        `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`,
        `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token.0`,
        `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token.1`,
    ];

    for (const name of cookieNames) {
        if (name && !name.includes('undefined')) {
            response.cookies.set(name, '', {
                maxAge: 0,
                path: '/',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
            });
        }
    }

    return response;
}, { requireAuth: true, requireCsrf: true, rateLimit: 'userStrict', auditAction: 'logout' });
