import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
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
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh session if expired
    const { data: { user } } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    
    // Ignore static files and api routes for this main guard
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
    const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');
    
    // Redirect unauthenticated users from protected routes
    if (!user && (isAppRoute || isOnboardingRoute)) {
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
        if (isOnboarded && isOnboardingRoute) {
            const redirectUrl = request.nextUrl.clone();
            // Optional: send to /app instead
            redirectUrl.pathname = '/app';
            return NextResponse.redirect(redirectUrl);
        }

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
