import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { startOfDay, format, parseISO } from 'date-fns';

export const POST = secureApiRoute(
    async (context, body) => {
        try {
            const { userId, supabase } = context;
            const { date, focus } = body as {
                date: string;
                focus?: 'reduce_overwhelm' | 'maximize_output' | 'rebalance_pillars'
            };

            const targetDate = date ? parseISO(date) : startOfDay(new Date());
            const dateStr = format(targetDate, 'yyyy-MM-dd');

            // 1. Fetch Deep Context
            const { buildFeatureContext } = await import('@/lib/services/feature-context');
            const featureCtx = await buildFeatureContext(userId, supabase, {
                includeChatHistory: true,
                includeRecentDumps: true,
                includeHabitStacks: true,
                weekDays: 1 // optimize day only needs immediate schedule
            });

            const allBlocks = featureCtx.schedule || [];
            const blocks = allBlocks.filter((b: any) => b.date === dateStr && b.status !== 'inbox');
            const inboxTasks = allBlocks.filter((b: any) => b.status === 'inbox');
            const goals = featureCtx.goals;
            const anchors = featureCtx.anchors;
            const prefs = featureCtx.preferences;

            // 2. Call AI with full holistic context
            let aiResponse: any;
            try {
                const { executeAI } = await import('@/lib/ai/ai-service');

                aiResponse = await executeAI(userId, {
                    channel: 'calendar_optimize_day',
                    input: `Optimize schedule for ${dateStr}. Focus: ${focus || 'balance'}`,
                    context: {
                        date: dateStr,
                        focus,
                        profile: prefs,
                        user_state: featureCtx.userState,
                        capacity: featureCtx.capacity,
                        recent_brain_dumps: featureCtx.recentDumps,
                        recent_coach_chats: featureCtx.chatHistory,
                        habit_stacks: featureCtx.habitStacks?.map((h: any) => ({
                            name: h.name || h.trigger_habit,
                            preferred_window: h.preferred_window,
                            duration_mins: h.action_duration_mins
                        })),
                        inbox_tasks: inboxTasks.map((t: any) => ({
                            id: t.id,
                            title: t.title,
                            estimated_minutes: t.meta?.estimated_minutes || 30
                        })),
                        blocks: blocks.map((b: any) => ({
                            id: b.id,
                            title: b.title || 'Untitled',
                            start_time: b.start_time,
                            end_time: b.end_time,
                            block_type: b.block_type || 'task',
                            status: b.status,
                            pillar: b.pillar,
                            goal_id: b.goal_id,
                            is_focus: b.is_focus
                        })),
                        goals: goals.map((g: any) => ({
                            id: g.id,
                            title: g.title,
                            importance: g.importance,
                            category: g.category,
                            pillar: g.pillar,
                            ai_plan: g.ai_plan // Ensure goals milestones are visible
                        })),
                        anchors: anchors.map((a: any) => ({
                            title: a.title,
                            start_time: a.start_time,
                            end_time: a.end_time,
                            days_of_week: a.days_of_week
                        }))
                    }
                });
            } catch (aiErr: any) {
                console.error('[OptimizeDay] AI call failed:', aiErr);
                return apiSuccess({
                    analysis: { energy_state: 'error', schedule_health: 'balanced', flow_opportunity: `DEBUG: ${aiErr.message}` },
                    options: [],
                    warnings: [`DEBUG OPTIMIZE ERROR: ${aiErr.message || 'Unknown AI service error'}.`]
                });
            }

            // 3. Return Options directly to User Interface
            const options = aiResponse?.options || [];
            if (options.length === 0) {
                return apiSuccess({
                    analysis: aiResponse?.analysis || { energy_state: 'unknown', schedule_health: 'conflict', flow_opportunity: 'none' },
                    options: []
                });
            }

            return apiSuccess({
                analysis: aiResponse?.analysis,
                options: options,
                warnings: aiResponse?.warnings || []
            });

        } catch (e: any) {
            console.error('[OptimizeDay] Unexpected Error:', e);
            return apiError(`Failed to optimize: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);

// Helper: convert "HH:MM" to minutes since midnight
function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
