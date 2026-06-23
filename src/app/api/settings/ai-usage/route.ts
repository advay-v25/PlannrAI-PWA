import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startOfDay, startOfMonth } from 'date-fns';

export const maxDuration = 60;


export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        const dayStart = startOfDay(now).toISOString();
        const monthStart = startOfMonth(now).toISOString();

        // Count for today
        const { count: dailyCount } = await supabase
            .from('security_audit_log')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('action', 'ai_execute')
            .gte('created_at', dayStart);

        // Count for this month
        const { count: monthlyCount } = await supabase
            .from('security_audit_log')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('action', 'ai_execute')
            .gte('created_at', monthStart);

        return NextResponse.json({
            daily: dailyCount || 0,
            monthly: monthlyCount || 0,
            limit: 14400 // Daily limit (Groq free tier)
        });

    } catch (error) {
        console.error('Error fetching AI usage stats:', error);
        return NextResponse.json({ error: 'Failed to fetch usage stats' }, { status: 500 });
    }
}
