import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';
import { generateCoachPlan } from '@/lib/ai/groq-client';
import { format } from 'date-fns';

export const POST = secureApiRoute(async (context: SecureApiContext, body: any) => {
    const supabase = await createClient(); // Fixed await
    const { userMessage, date, timezone } = body;

    if (!userMessage || !date) {
        return apiError('Missing message or date', 400);
    }

    // 1. Fetch Schedule Context for AI Analysis
    const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('start_time, end_time, context, block_type')
        .eq('user_id', context.userId)
        .eq('date', date)
        .order('start_time');

    // 2. Identify busy duration logic (simplistic for now)
    const busyDuration = (blocks || []).reduce((acc: number, b: any) => {
        // todo: real duration calc
        return acc + 30;
    }, 0);

    // 3. Generate Options via AI
    const plan = await generateCoachPlan(
        userMessage,
        {
            currentSchedule: blocks || [],
            busyDuration
        },
        context.userId
    );

    return apiSuccess(plan);
});
