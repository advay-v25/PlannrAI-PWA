import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logAuthEvent } from '@/lib/security/audit-logger';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/app';

    if (code) {
        console.log('[Auth Callback]: Exchanging code for session...');
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            console.log('[Auth Callback]: Session exchange successful');
            // Get the authenticated user
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // Log successful login (non-blocking)
                logAuthEvent('login_success', user.id, request, {
                    provider: user.app_metadata?.provider || 'email',
                }).catch(err => console.error('Failed to log auth event:', err));

                // Check if profile exists
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('onboarding_complete')
                    .eq('id', user.id)
                    .single();

                // If no profile exists, create one and redirect to onboarding
                if (profileError || !profile) {
                    // Create new profile for the user
                    await supabase.from('profiles').insert({
                        id: user.id,
                        email: user.email,
                        onboarding_complete: false,
                    });

                    // If they just created the profile via Google (no email provider), ask them to set a password
                    const providers = user.app_metadata?.providers || [];
                    if (!providers.includes('email')) {
                         return NextResponse.redirect(`${origin}/set-password?next=/onboarding`);
                    }

                    if (next === '/reset-password') {
                        return NextResponse.redirect(`${origin}/reset-password`);
                    }
                    return NextResponse.redirect(`${origin}/onboarding`);
                }

                // Redirect to onboarding if not complete (unless resetting password)
                if (!profile.onboarding_complete && next !== '/reset-password') {
                    return NextResponse.redirect(`${origin}/onboarding`);
                }
            }

            return NextResponse.redirect(`${origin}${next}`);
        } else {
            console.error('[Auth Callback Error]:', error.message);
            // Log failed auth
            await logAuthEvent('login_failed', undefined, request, {
                error: error.message,
            });
            return NextResponse.redirect(`${origin}/login?error=auth`);
        }
    }

    console.warn('[Auth Callback]: No code found in URL');
    // Return to login if no code
    return NextResponse.redirect(`${origin}/login?error=no_code`);
}
