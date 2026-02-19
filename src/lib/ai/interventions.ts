
import { groqChat } from '@/lib/ai/groq-client';
import { differenceInDays, subDays } from 'date-fns';
import { InterventionLog } from '@/types/database';
import { SupabaseClient } from '@supabase/supabase-js';

export const InterventionManager = {
    /**
     * MAIN ENTRY: Check if we need to nudge the user.
     * Enforces rate limiting (max 1 intervention per 24 hours).
     */
    async checkInterventions(userId: string, supabase: SupabaseClient): Promise<InterventionLog | null> {
        const { data: recentLogs } = await supabase
            .from('intervention_logs')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (recentLogs && recentLogs.length > 0) {
            const lastLog = new Date(recentLogs[0].created_at);
            const now = new Date();
            if (differenceInDays(now, lastLog) < 1) {
                return null;
            }
        }

        const stagnationNudge = await this.checkStagnation(userId, supabase);
        if (stagnationNudge) return stagnationNudge;

        const burnoutNudge = await this.checkBurnout(userId, supabase);
        if (burnoutNudge) return burnoutNudge;

        return null;
    },

    async checkStagnation(userId: string, supabase: SupabaseClient): Promise<InterventionLog | null> {
        const { data: goals } = await supabase
            .from('goals')
            .select('id, title, updated_at, category')
            .eq('user_id', userId)
            .eq('is_paused', false)
            .lt('updated_at', subDays(new Date(), 7).toISOString())
            .limit(1);

        if (goals && goals.length > 0) {
            const goal = goals[0];
            const message = await this.generateNudge(
                'stagnation',
                `Goal "${goal.title}" (${goal.category}) hasn't moved in a week.`,
                userId
            );

            const { data: log } = await supabase
                .from('intervention_logs')
                .insert({
                    user_id: userId,
                    type: 'stagnation',
                    message: message,
                    status: 'pending'
                })
                .select()
                .single();

            return log;
        }
        return null;
    },

    async checkBurnout(userId: string, supabase: SupabaseClient): Promise<InterventionLog | null> {
        const { data: profile } = await supabase
            .from('profiles')
            .select('stress_level, updated_at')
            .eq('id', userId)
            .single();

        if (profile && profile.stress_level >= 4) {
            const message = await this.generateNudge(
                'burnout',
                `User stress level is ${profile.stress_level}/5.`,
                userId
            );

            const { data: log } = await supabase
                .from('intervention_logs')
                .insert({
                    user_id: userId,
                    type: 'burnout',
                    message: message,
                    status: 'pending'
                })
                .select()
                .single();

            return log;
        }
        return null;
    },

    async generateNudge(type: string, context: string, userId: string): Promise<string> {
        try {
            const text = await groqChat({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are "Donna": a proactive, high-EQ executive assistant. Write short, warm nudges under 20 words. No quotes.' },
                    { role: 'user', content: `Type: ${type}. Context: ${context}. Write a short nudge message.` }
                ],
                temperature: 0.6,
                max_tokens: 60,
                userId
            });
            return text.replace(/"/g, '');
        } catch (e) {
            return "I noticed something we should discuss.";
        }
    }
}
