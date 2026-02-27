/**
 * 🎯 PLANNRAI — Expert Strategy Generator for Goals
 * Generates AI-powered productivity strategies and scheduling rules
 * based on user goals, patterns, and capacity.
 */

import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { callAI } from '@/lib/ai/unified-client';
import { buildCalendarContext } from '@/lib/calendar/context-builder';

export const POST = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;

        try {
            // 1. Build full context
            const ctx = await buildCalendarContext(userId, supabase);

            if (ctx.goals.length === 0) {
                return apiSuccess({
                    strategy: null,
                    message: 'Add some goals first to generate a strategy.',
                });
            }

            // 2. AI Prompt
            const systemPrompt = `You are an expert productivity strategist. Analyze the user's goals, schedule, and patterns to create a personalized scheduling strategy.

Your strategy should be:
- Specific and actionable (not generic advice)
- Based on their actual data
- Realistic given their capacity
- Encouraging but honest about overcommitment

Return valid JSON only.`;

            const userPrompt = `Create an expert productivity strategy for this user.

USER: ${ctx.user.first_name}
SLEEP: ${ctx.user.sleep_end} wake → ${ctx.user.sleep_start} sleep
WIND-DOWN: ${ctx.user.wind_down_mins} minutes before sleep

GOALS (${ctx.goals.length}):
${ctx.goals.map(g => `- ${g.title} (${g.pillar.toUpperCase()}, ${g.energy_demand} energy): ${g.weekly_target_minutes}min/week, importance ${g.importance}`).join('\n')}

CAPACITY:
- Daily awake: ${ctx.capacity.daily_awake_hours}h
- Weekly available: ${ctx.capacity.weekly_available_hours}h
- Already committed: ${ctx.capacity.weekly_committed_hours}h
- Goals need: ${ctx.capacity.weekly_goal_hours_needed}h
${ctx.capacity.is_overcommitted ? '⚠️ OVERCOMMITTED' : '✓ Capacity OK'}

COMMITMENTS:
${ctx.commitments.length > 0 ? ctx.commitments.map(c => `- ${c.title}: ${c.start_time}-${c.end_time} on ${(c.days_of_week || []).join(', ')}`).join('\n') : 'None'}

PERFORMANCE: ${ctx.performance.last_7_days_completion_rate}% completion (${ctx.performance.completed_blocks_last_7}/${ctx.performance.total_blocks_last_7} blocks)

OUTPUT FORMAT:
{
  "summary": "One paragraph overview of the strategy",
  "archetype": {
    "name": "Morning Sprinter",
    "description": "You thrive in early hours with focused bursts"
  },
  "scheduling_rules": [
    {
      "rule": "Do high-energy tasks before 11am",
      "reasoning": "Your completion rate is highest in mornings",
      "priority": 1
    }
  ],
  "pillar_strategies": {
    "mind": {
      "best_time": "09:00-11:00",
      "block_duration": 45,
      "frequency": "daily",
      "tips": ["Start with 5 min warm-up reading"]
    },
    "body": {
      "best_time": "07:00-08:00",
      "block_duration": 30,
      "frequency": "4x/week",
      "tips": ["Morning movement before breakfast"]
    },
    "craft": {
      "best_time": "14:00-16:00",
      "block_duration": 60,
      "frequency": "5x/week",
      "tips": ["Block distractions, deep focus"]
    }
  },
  "weekly_template": {
    "monday": ["Body 7am", "Mind 9am", "Craft 2pm"],
    "tuesday": ["Body 7am", "Craft 9am", "Mind 2pm"],
    "wednesday": ["Body 7am", "Mind 9am", "Craft 2pm"],
    "thursday": ["Craft 9am", "Mind 2pm"],
    "friday": ["Body 7am", "Mind 9am"],
    "saturday": ["Light activity"],
    "sunday": ["Rest and reflect"]
  },
  "warnings": ["You are overcommitted by 3 hours — consider reducing craft time"]
}`;

            const response = await callAI<any>({
                prompt: userPrompt,
                systemPrompt,
                model: 'smart',
                temperature: 0.6,
                maxTokens: 3000,
                requireJSON: true,
                timeout: 25000,
            });

            if (!response.success || !response.data) {
                return apiSuccess({
                    strategy: generateFallbackStrategy(ctx),
                    source: 'fallback',
                    message: 'Generated basic strategy (AI unavailable)',
                });
            }

            // 3. Save strategy to profile or separate table
            try {
                await supabase.from('profiles').update({
                    expert_strategy: response.data,
                    strategy_updated_at: new Date().toISOString(),
                }).eq('id', userId);
            } catch (e) {
                console.warn('[ExpertStrategy] Failed to save strategy:', e);
            }

            return apiSuccess({
                strategy: response.data,
                source: 'ai',
                provider: response.provider,
                latency_ms: response.latency_ms,
            });

        } catch (e: any) {
            console.error('[ExpertStrategy] Error:', e);
            return apiError(`Strategy generation failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);

function generateFallbackStrategy(ctx: any) {
    const goals = ctx.goals || [];
    return {
        summary: `Focus on your ${goals.length} active goals with a balanced approach across the week.`,
        archetype: {
            name: 'Balanced Builder',
            description: 'Steady progress through consistent daily action.',
        },
        scheduling_rules: [
            { rule: 'Start each day with your highest-priority goal', reasoning: 'Morning energy is typically highest', priority: 1 },
            { rule: 'Add 15-min buffers between goal blocks', reasoning: 'Prevents burnout and allows transition', priority: 2 },
            { rule: 'Keep weekends light', reasoning: 'Recovery is essential for long-term consistency', priority: 3 },
        ],
        pillar_strategies: {
            mind: { best_time: '09:00-11:00', block_duration: 45, frequency: 'daily', tips: ['Start with reading or journaling'] },
            body: { best_time: '07:00-08:00', block_duration: 30, frequency: '4x/week', tips: ['Even a short walk counts'] },
            craft: { best_time: '14:00-16:00', block_duration: 60, frequency: '5x/week', tips: ['Deep focus, no distractions'] },
        },
        weekly_template: {
            monday: goals.map((g: any) => g.title).slice(0, 3),
            tuesday: goals.map((g: any) => g.title).slice(0, 3),
            wednesday: goals.map((g: any) => g.title).slice(0, 3),
            thursday: goals.map((g: any) => g.title).slice(0, 2),
            friday: goals.map((g: any) => g.title).slice(0, 2),
            saturday: ['Light activity'],
            sunday: ['Rest and reflect'],
        },
        warnings: ctx.capacity.is_overcommitted ? ['You are overcommitted — consider reducing some goal targets'] : [],
    };
}
