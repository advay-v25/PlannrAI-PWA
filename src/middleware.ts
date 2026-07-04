import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    try {
        let supabaseResponse = NextResponse.next({
            request,
        });

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            // Next.js request.cookies.set doesn't support options directly, but response does.
                            // However, we still apply it to request for consistency in the current request lifecycle.
                            request.cookies.set({ name, value, ...options });
                        });
                        supabaseResponse = NextResponse.next({
                            request,
                        });
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set({ name, value, ...options })
                        );
                    },
                },
            }
        );

        // Refresh session if expired
        const { data: { user } } = await supabase.auth.getUser();

        const { pathname } = request.nextUrl;
        
        // Feature flag guard for preview features
        if (pathname.startsWith('/api/weekly-review') || (pathname.startsWith('/api/habit-stack/') || pathname === '/api/habit-stack') || pathname.startsWith('/api/goals/plan') || pathname.startsWith('/api/goals/strategy') || pathname.startsWith('/api/goals/generate-strategy') || pathname.startsWith('/api/goals/auto-schedule')) {
            const isPreviewEnabled = process.env.NEXT_PUBLIC_IS_PREVIEW_BUILD === 'true' || process.env.NODE_ENV !== 'production';
            if (!isPreviewEnabled) {
                return new NextResponse(JSON.stringify({ ok: false, error: 'Feature disabled in production' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // CSRF Token Generation (Must happen before early returns to support soft navigations)
        const csrfCookie = request.cookies.get('csrf_token');
        if (!csrfCookie) {
            const token = crypto.randomUUID();
            supabaseResponse.cookies.set('csrf_token', token, {
                httpOnly: false, // JS needs to read this for Double Submit
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
            });
        }

        // Ignore static files and other api routes for this main auth guard
        if (
            pathname.startsWith('/_next') ||
            pathname.startsWith('/api') ||
            pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js)$/)
        ) {
            return supabaseResponse;
        }

        // App routes protection
        const isAppRoute = pathname.startsWith('/app');
        const isOnboardingRoute = pathname.startsWith('/onboarding');
        const isSetPasswordRoute = pathname.startsWith('/set-password');
        const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');
        
        // Redirect unauthenticated users from protected routes
        if (!user && (isAppRoute || isOnboardingRoute || isSetPasswordRoute)) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = '/login';
            return NextResponse.redirect(redirectUrl);
        }

        // If authenticated
        if (user) {
            // Fetch onboarding status safely
            const { data: profile } = await supabase
                .from('profiles')
                .select('onboarding_complete')
                .eq('id', user.id)
                .single();

            const isOnboarded = profile?.onboarding_complete === true;

            // Redirect configured users away from onboarding
            // if (isOnboarded && isOnboardingRoute) {
            //     const redirectUrl = request.nextUrl.clone();
            //     // Optional: send to /app instead
            //     redirectUrl.pathname = '/app';
            //     return NextResponse.redirect(redirectUrl);
            // }

            // Redirect un-onboarded users to onboarding
            if (!isOnboarded && isAppRoute) {
                const redirectUrl = request.nextUrl.clone();
                redirectUrl.pathname = '/onboarding';
                return NextResponse.redirect(redirectUrl);
            }

            // Redirect authenticated users away from login pages
            if (isAuthRoute) {
                const redirectUrl = request.nextUrl.clone();
                redirectUrl.pathname = isOnboarded ? '/app' : '/onboarding';
                return NextResponse.redirect(redirectUrl);
            }
        }

        return supabaseResponse;
    } catch (e) {
        console.error('[Middleware Error]:', e);
        return new NextResponse('Internal Server Error from middleware catch', { status: 500 });
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
