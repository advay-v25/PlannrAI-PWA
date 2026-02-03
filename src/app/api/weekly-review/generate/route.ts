import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { generateWeeklyReview } from '@/lib/ai/groq-client';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';

export const POST = secureApiRoute(
    async (context, body) => {
        // Validate required fields
        const validation = validateRequiredFields(body, ['weekStart', 'weekEnd']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { weekStart, weekEnd } = body as { weekStart: string; weekEnd: string };

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(weekStart) || !dateRegex.test(weekEnd)) {
            return apiError('Invalid date format. Use YYYY-MM-DD');
        }

        const supabase = await createClient();

        // Get schedule blocks for the week
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*, goal:goals(title)')
            .eq('user_id', context.userId)
            .gte('date', weekStart)
            .lte('date', weekEnd);

        // Get brain dumps for the week
        const { data: dumps } = await supabase
            .from('brain_dumps')
            .select('extracted_signals, detected_constraints')
            .eq('user_id', context.userId)
            .gte('created_at', weekStart)
            .lte('created_at', `${weekEnd}T23:59:59`);

        // Calculate metrics
        const plannedMinutes = blocks?.reduce((sum, b) => {
            const start = new Date(`1970-01-01T${b.start_time}`);
            const end = new Date(`1970-01-01T${b.end_time}`);
            return sum + (end.getTime() - start.getTime()) / 60000;
        }, 0) || 0;

        const actualMinutes = blocks
            ?.filter(b => b.status === 'done' || b.status === 'partial')
            .reduce((sum, b) => {
                const start = new Date(`1970-01-01T${b.start_time}`);
                const end = new Date(`1970-01-01T${b.end_time}`);
                const duration = (end.getTime() - start.getTime()) / 60000;
                return sum + (b.status === 'partial' ? duration * 0.5 : duration);
            }, 0) || 0;

        // Aggregate signals
        const allSignals = dumps?.flatMap(d => d.extracted_signals || []) || [];
        const allConstraints = dumps?.flatMap(d => d.detected_constraints || []) || [];

        try {
            // Generate AI review
            const reviewData = await generateWeeklyReview(
                {
                    plannedMinutes,
                    actualMinutes,
                    completedBlocks: blocks?.filter(b => b.status === 'done').length || 0,
                    missedBlocks: blocks?.filter(b => b.status === 'missed').length || 0,
                    stressSignals: allSignals.filter((s: { type: string }) => s.type === 'stress').length,
                    energyConstraints: allConstraints.filter((c: { type: string }) => c.type === 'energy').length,
                },
                context.userId
            );

            // Log AI request
            await logAIRequest(context.userId, '/api/weekly-review/generate', context.request, true);

            // Save review
            const { data: review, error } = await supabase
                .from('weekly_reviews')
                .upsert({
                    user_id: context.userId,
                    week_start: weekStart,
                    week_end: weekEnd,
                    planned_minutes: Math.round(plannedMinutes),
                    actual_minutes: Math.round(actualMinutes),
                    energy_trend: reviewData.energyTrend,
                    stress_trend: reviewData.stressTrend,
                    friction_patterns: reviewData.frictionPatterns,
                    suggested_adjustment: reviewData.suggestedAdjustment,
                }, {
                    onConflict: 'user_id,week_start',
                })
                .select()
                .single();

            if (error) throw error;

            return apiSuccess({
                review: {
                    ...review,
                    wins: reviewData.wins,
                },
            });

        } catch (error) {
            // Log failed AI request
            await logAIRequest(context.userId, '/api/weekly-review/generate', context.request, false, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return apiError('Failed to generate weekly review', 500);
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'weekly_review_generate',
    }
);
