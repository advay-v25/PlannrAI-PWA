import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get(name) { return cookieStore.get(name)?.value; } } }
    );

    const { data: messages } = await supabase
        .from('coach_messages')
        .select('id, role, content, selected_option_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    return NextResponse.json({ messages });
}
