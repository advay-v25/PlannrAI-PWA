
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { SchedulerService } from '@/lib/scheduler/scheduler-service';
import { startOfDay, addDays, format, parseISO } from 'date-fns';
import { ChannelRegistry } from '@/lib/ai/registry';
import { CalendarPlanWeekSchema } from '@/lib/ai/schemas';
import { groqChat } from '@/lib/ai/groq-client';
import { JSONReliability } from '@/lib/ai/json-reliability';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { start_date, mode, allow_weekend } = body as {
            start_date: string;
            mode: 'balanced' | 'intense' | 'recovery';
            allow_weekend?: boolean
        };

        const startDate = start_date ? parseISO(start_date) : startOfDay(new Date());
        const days = 7;
        const endDate = addDays(startDate, days);
        const startStr = format(startDate, 'yyyy-MM-dd');

        // 1. Fetch Full Context
        const [profileRes, commitmentsRes, goalsRes, habitsRes, existingBlocksRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).single(),
            supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true),
            supabase.from('goals').select('*').eq('user_id', userId).eq('is_paused', false),
            supabase.from('habit_stacks').select('*').eq('user_id', userId).eq('enabled', true),
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startStr)
                .lt('date', format(endDate, 'yyyy-MM-dd'))
        ]);

        if (profileRes.error) return apiError('Failed to load profile', 500);

        const schedulerContext = {
            startDate,
            days,
            profile: profileRes.data,
            commitments: commitmentsRes.data || [],
            goals: goalsRes.data || [],
            habitStacks: habitsRes.data || [],
            existingBlocks: existingBlocksRes.data || []
        };

        // 2. Run Deterministic Scheduler (Baseline)
        const scheduler = new SchedulerService(schedulerContext);
        const baselineBlocks = scheduler.generateBaseline();

        // 3. AI Optimization
        // We want to ask the AI to generate *variants* or *improvements* on the baseline, 
        // or just generate the whole plan. The Prompt says "returns 2-3 plan variants".

        // Let's ask AI to "Plan the week" given the context and the 'baseline' as a starting point.
        const channelDef = (ChannelRegistry as any)['calendar_plan_week'] || (ChannelRegistry as any)['calendar.optimize']; // Fallback if plan_week not defined yet

        // Wait, I haven't defined 'calendar_plan_week' in registry.ts yet. 
        // I should probably define it or use 'calendar.optimize' iteratively? 
        // The prompt asked me to "Configure calendar_plan_week channel & prompt".
        // For now, I'll use a local prompt construction or assume I'll update registry next.
        // Actually, to make this work NOW, I'll update registry.ts first? 
        // No, I can construct the prompt here for MVP if needed, but registry is cleaner.
        // Let's stick to the plan: I will assume the channel exists or I'll add it in the next step. 
        // Actually, I can add it to registry.ts NOW.
        // But I cannot edit registry.ts easily while writing this file.
        // I'll write this file assuming `calendar.optimize` can handle it or I'll implement a custom flow here.

        // Let's use `groqChat` directly with a custom prompt for now to bypass registry strictness if needed, 
        // OR better: Update Registry.ts in next step and use 'calendar_plan_week'. 
        // I'll write the code to use 'calendar_plan_week' and then immediately update registry.

        const aiInput = `Plan week starting ${startStr}. Mode: ${mode}. Weekend allowed: ${allow_weekend}`;
        const aiContext = {
            ...schedulerContext,
            baseline_blocks_count: baselineBlocks.length,
            // Don't send all baseline blocks if too large, maybe just summary
            baseline_sample: baselineBlocks.slice(0, 10)
        };

        // Reuse the logic from execute/route.ts partially? 
        // Or just one-off call.
        // Im using the direct call pattern to ensure custom logic.

        const systemPrompt = `You are the Week Architect. 
        Generate 2-3 schedule options (Balanced, Intense, Recovery).
        Each option must include a 'patch' with 'create_block' ops for the entire week.
        Respect constraints: Sleep ${profileRes.data.sleep_start}-${profileRes.data.sleep_end}, Meals.
        
        Output JSON:
        {
            "options": [{
                "label": "Balanced Flow",
                "description": "Steady progress",
                "patch": { "ops": [ ... ], "reason": "..." }
            }]
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
                temperature: 0.4
            });

            // Parse response
            aiResponse = await JSONReliability.validateOrRepair(text, CalendarPlanWeekSchema, 'llama-3.3-70b-versatile', "options array");
        } catch (e) {
            console.error("AI Planning failed", e);
            // Fallback: Wrap baseline in an option
            aiResponse = {
                options: [{
                    label: "Deterministic Baseline",
                    description: "Generated based on strict rules.",
                    patch: {
                        ops: baselineBlocks.map((b: any) => ({
                            op: 'create_block',
                            payload: b
                        })),
                        reason: "Fallback"
                    }
                }]
            };
        }

        return apiSuccess(aiResponse);
    },
    { requireAuth: true }
);
