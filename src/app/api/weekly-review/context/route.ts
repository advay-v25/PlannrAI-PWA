import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const GET = secureApiRoute(
    async (context, body) => {
        // Parse Query Params (weekStart, weekEnd)
        const { searchParams } = new URL(context.request.url);
        const weekStart = searchParams.get('weekStart');
        const weekEnd = searchParams.get('weekEnd');

        if (!weekStart || !weekEnd) {
            return apiError('Missing required query params: weekStart, weekEnd');
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
            .from('brain_dump_entries')
            .select('extracted_json')
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
        const allSignals = dumps?.flatMap(d => d.extracted_json?.signals || d.extracted_json?.extracted_signals || []) || [];
        const allConstraints = dumps?.flatMap(d => d.extracted_json?.constraints || d.extracted_json?.detected_constraints || []) || [];

        // Fetch Profile, Goals & Facts
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', context.userId).single();
        const { data: goals } = await supabase.from('goals').select('*').eq('user_id', context.userId).eq('is_paused', false);
        const { data: facts } = await supabase.from('memory_facts').select('*').eq('user_id', context.userId).order('confidence', { ascending: false }).limit(10);

        // Fetch Intelligence Context (if needed) or mock
        // We skip heavy ContextEngine for now as it's server-heavy. 
        // We rely on metrics + signals + goals.

        return apiSuccess({
            plannedMinutes,
            actualMinutes,
            completionRate: (blocks?.filter(b => b.status === 'done').length || 0) / (blocks?.length || 1),
            signals: allSignals.slice(0, 20),
            constraints: allConstraints.slice(0, 10),
            goals: goals || [],
            preferences: profile || {},
            facts: facts || [],
            weekStart,
            weekEnd
        });
    },
    {
        requireAuth: true,
        rateLimit: 'ai', // Using AI rate limit as it preps for AI
        auditAction: 'weekly_review_context',
    }
);
