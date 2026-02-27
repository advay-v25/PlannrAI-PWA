import { NextResponse } from 'next/server';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const context = await buildCalendarContext(user.id, supabase);

        return NextResponse.json({
            success: true,
            context,
            summary: {
                user: context.user.first_name,
                goals_count: context.goals.length,
                commitments_count: context.commitments.length,
                today_blocks: context.schedule.today.length,
                week_blocks: context.schedule.this_week.length,
                capacity: context.capacity,
                performance: context.performance,
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}
