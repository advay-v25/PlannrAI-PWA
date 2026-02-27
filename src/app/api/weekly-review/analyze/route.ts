import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WeeklyReviewAI } from '@/lib/ai/WeeklyReviewAI';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { week_start, week_end } = body;

        if (!week_start || !week_end) {
            return NextResponse.json({ error: 'Missing week_start or week_end' }, { status: 400 });
        }

        const processor = new WeeklyReviewAI(user.id);
        const result = await processor.analyze(week_start, week_end);

        // Save to weekly_review_data for persistence during the flow
        await supabase.from('weekly_review_data').insert({
            user_id: user.id,
            week_start,
            metrics: result.metrics,
            patterns: result.patterns,
            lever: result.lever
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Weekly Review Analyze Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
