import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuthEvent } from '@/lib/security/audit-logger';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Get current user before logout
        const { data: { user } } = await supabase.auth.getUser();

        // Sign out
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('Logout error:', error);
            return NextResponse.json(
                { error: 'Failed to logout' },
                { status: 500 }
            );
        }

        // Log logout event
        if (user) {
            await logAuthEvent('logout', user.id, request);
        }

        // Create response with cleared cookies
        const response = NextResponse.json({ success: true });

        // Clear Supabase cookies
        response.cookies.delete('sb-access-token');
        response.cookies.delete('sb-refresh-token');

        return response;

    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}
