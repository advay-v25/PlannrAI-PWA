
import { createClient } from '@/lib/supabase/server';
import { ContextEngine } from './context-engine';
import { getGeminiClient, SYSTEM_PROMPTS } from '@/lib/gemini';
import { SupabaseClient } from '@supabase/supabase-js';

export class ThinkingService {
    /**
     * Master synthesis loop.
     * Analyzes current context and generates proactive interventions.
     */
    static async analyze(userId: string, date: string, supabase?: SupabaseClient) {
        const client = supabase ?? await createClient();

        // 1. Build Full System Context
        const context = await ContextEngine.build(userId, date, client);

        // 2. Prepare Brief for AI
        const contextBrief = {
            user: context.profile.preferred_name || 'User',
            state: {
                mode: context.computedMode.toUpperCase(),
                energy: `${context.energyCapacity}%`,
                isLowEnergyMode: context.profile.low_energy_mode
            },
            weeklyProgress: context.goals.map(g => ({
                title: g.title,
                progress: `${context.weeklyGoalCounts[g.id] || 0}/${g.days_per_week}`,
                status: (context.weeklyGoalCounts[g.id] || 0) >= g.days_per_week ? 'completed' : 'pending'
            })),
            dailyStats: context.stats ? {
                cognitiveLoad: context.stats.cognitive_load_score,
                physicalLoad: context.stats.physical_load_score,
                fragmentation: context.stats.fragmentation_score,
                mode: context.stats.dominant_mode
            } : 'No stats for today yet',
            memory: context.userContext.map(c => ({ type: c.type, fact: c.content })),
            signals: context.recentSignals.map(s => ({ action: s.action_type, details: s.meta }))
        };

        // 3. Request Proactive Synthesis from Gemini
        const gemini = getGeminiClient();
        const response = await gemini.generate(
            JSON.stringify(contextBrief, null, 2),
            SYSTEM_PROMPTS.THINKING_ENGINE
        );

        try {
            // Cleanup response if AI adds markdown
            const cleanJson = response.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();
            const result = JSON.parse(cleanJson);

            if (result.interventions && Array.isArray(result.interventions)) {
                const interventions = [];
                for (const item of result.interventions) {
                    // Only act on high confidence signals
                    if (item.confidence >= 0.7) {
                        const { data, error } = await client.from('ai_interventions').insert({
                            user_id: userId,
                            type: item.type,
                            message: item.message,
                            payload: item.payload || {},
                            status: 'pending'
                        }).select().single();

                        if (!error && data) {
                            interventions.push(data);
                        }
                    }
                }
                return { success: true, interventions };
            }

            return { success: true, interventions: [] };
        } catch (e) {
            console.error('[ThinkingService] Synthesis failed:', e);
            return { success: false, error: 'Failed to process AI synthesis' };
        }
    }
}
