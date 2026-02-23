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
        const { block_id, duration_minutes, target_date } = body;

        if (!block_id || !duration_minutes || !target_date) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const result = await CalendarEngine.autoPlace(user.id, block_id, duration_minutes, target_date, supabase);

        return NextResponse.json({ success: true, data: result });
    } catch (e: any) {
        console.error('[auto-place API] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
