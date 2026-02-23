import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { title, estimated_minutes } = body;

        if (!title) {
            return NextResponse.json({ error: 'Missing title' }, { status: 400 });
        }

        const result = await CalendarEngine.addInboxItem(user.id, title, estimated_minutes, supabase);

        return NextResponse.json({ success: true, data: result });
    } catch (e: any) {
        console.error('[inbox API] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
