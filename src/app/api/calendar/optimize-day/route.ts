
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { SchedulerService } from '@/lib/scheduler/scheduler-service';
import { startOfDay, endOfDay, format, parseISO } from 'date-fns';
import { ChannelRegistry } from '@/lib/ai/registry';
import { DayOptimizationSchema } from '@/lib/ai/schemas';
import { groqChat } from '@/lib/ai/groq-client';
import { JSONReliability } from '@/lib/ai/json-reliability';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { date, focus } = body as {
            date: string;
            focus?: 'reduce_overwhelm' | 'maximize_output' | 'rebalance_pillars'
        };

        const targetDate = date ? parseISO(date) : startOfDay(new Date());
        const dateStr = format(targetDate, 'yyyy-MM-dd');

        // 1. Fetch Context for Day + User Profile
        const [profileRes, commitmentsRes, currentBlocksRes, goalsRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).single(),
            supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true),
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .gte('date', dateStr) // Just for this day?
                .lte('date', dateStr), // We can also verify overlapping times if needed
            supabase.from('goals').select('title, priority, pillar, status').eq('user_id', userId).eq('is_paused', false)
        ]);

        if (profileRes.error) return apiError('Failed to load profile', 500);

        // 2. Scheduler Baseline (Optional, to fill gaps or enforce constraints first)
        // For Optimize Day, we really just want to *reorder* or *adjust* existing blocks, 
        // but maybe we should ensure anchors are locked first.
        // Let's trust currentBlocks to contain everything, assuming prior steps created them.

        const aiContext = {
            date: dateStr,
            focus,
            profile: profileRes.data,
            commitments: commitmentsRes.data || [],
            blocks: currentBlocksRes.data || [],
            goals: goalsRes.data || []
        };

        const systemPrompt = `You are the Day Optimizer. Re-organize today's blocks for better flow.
        Focus: ${focus || 'balance'}.
        
        OBJECTIVE:
        - Fix overlaps.
        - Group similar tasks (batching).
        - Insert breaks if intensity is high.
        
        OUTPUT JSON:
        {
          "analysis": { "energy_state": "string", "schedule_health": "string", "flow_opportunity": "string" },
          "strategy": { "main_focus": "string", "changes_made": "string", "reality_check_applied": boolean },
          "options": [{ "label": "string", "patch": { "ops": [...], "undoable": true } }]
        }`;

        let aiResponse;
        try {
            const text = await groqChat({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(aiContext) }
                ],
                userId,
                temperature: 0.3
            });

            aiResponse = await JSONReliability.validateOrRepair(
                text,
                DayOptimizationSchema,
                'llama-3.3-70b-versatile',
                "day optimization"
            );
        } catch (e) {
            console.error("Optimize Day failed", e);
            aiResponse = {
                analysis: { energy_state: "Unknown", schedule_health: "balanced", flow_opportunity: "none" },
                strategy: { main_focus: "Manual", changes_made: "Service unavailable", reality_check_applied: false },
                options: [{ label: "Keep Current", patch: { ops: [], undoable: false } }]
            };
        }

        return apiSuccess(aiResponse);
    },
    { requireAuth: true }
);
