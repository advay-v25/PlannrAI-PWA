
import { generateAIResponse } from '@/lib/ai/groq-client';
import { differenceInDays, subDays } from 'date-fns';
import { InterventionLog } from '@/types/database';
import { SupabaseClient } from '@supabase/supabase-js';

export const InterventionManager = {
    /**
     * MAIN ENTRY: Check if we need to nudge the user.
     * Enforces rate limiting (max 1 intervention per 24 hours).
     */
    async checkInterventions(userId: string, supabase: SupabaseClient): Promise<InterventionLog | null> {
        // 1. Rate Limit Check (Don't annoy users)
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
                return null; // Too soon
            }
        }

        // 2. Check for Stagnation (Stuck Goals)
        const stagnationNudge = await this.checkStagnation(userId, supabase);
        if (stagnationNudge) return stagnationNudge;

        // 3. Check for Burnout (High Stress)
        const burnoutNudge = await this.checkBurnout(userId, supabase);
        if (burnoutNudge) return burnoutNudge;

        return null; // All good
    },

    /**
     * LOGIC: Stagnation Detection
     * Trigger: Goal not updated in 7 days
     */
    async checkStagnation(userId: string, supabase: SupabaseClient): Promise<InterventionLog | null> {
        // Find active goals not updated recently
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

            // Log it
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

    /**
     * LOGIC: Burnout Detection
     * Trigger: Recent brain dump detected high stress
     */
    async checkBurnout(userId: string, supabase: SupabaseClient): Promise<InterventionLog | null> {
        // Need to query extracted signals from recent dumps
        // This assumes we are storing extracted signals in the extracted_json of brain_dump_entries table
        // For MVP, we'll check if the last dump had "stress" > 4 if we store that...
        // Actually, let's rely on the 'energy_level' in the profile if updated recently?
        // Or simpler: Check if user logged "stress_level" 4 or 5 in profile recently

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

    /**
     * AI GENERATION: Write the "Donna" text
     */
    async generateNudge(type: string, context: string, userId: string): Promise<string> {
        const prompt = `
YOU ARE "DONNA": A proactive, high-EQ executive assistant.
Context: ${context}
Task: Write a highly personal, short "Tap on the shoulder" message to the user.
Tone: Warm, discerning, proactive. NOT robotic.
Length: Under 20 words.
Example: "I noticed the Spanish goal is stalling. Should we pivot or push?"
`;
        try {
            // We use 'GOAL_SUGGESTION' as a proxy type or just generic if we didn't add INTERVENTION type
            const text = await generateAIResponse(prompt, 'COACH' as any, userId, false);
            return text.replace(/"/g, '');
        } catch (e) {
            return "I noticed something we should discuss.";
        }
    }
}
