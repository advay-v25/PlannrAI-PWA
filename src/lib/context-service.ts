import { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

export type ContextData = {
    schedule: any[];
    goals: any[];
    anchors: any[];
    history: any[];
    facts: any[];
    userState?: any;
};

export class ContextService {
    /**
     * Aggregates all relevant user context for the AI.
     * - Schedule: Today + 7 days
     * - Goals: All active
     * - Anchors: All active
     * - History: Last 10 messages from coach
     * - Facts: High confidence memory
     */
    static async getContext(userId: string): Promise<ContextData> {
        const supabase = await createClient();

        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);

        const todayStr = today.toISOString().split('T')[0];
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        try {
            const [schedule, goals, anchors, history, facts, profile] = await Promise.all([
                // 1. Schedule Blocks (Next 7 Days)
                supabase
                    .from('schedule_blocks')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('date', todayStr)
                    .lte('date', nextWeekStr)
                    .order('date', { ascending: true })
                    .order('start_time', { ascending: true }),

                // 2. Goals (Active)
                supabase
                    .from('goals')
                    .select('*')
                    .eq('user_id', userId)
                    .neq('status', 'completed'),

                // 3. Anchors (Active Definitions)
                supabase
                    .from('anchors')
                    .select('*')
                    .eq('user_id', userId),

                // 4. Conversation History (Coach)
                supabase
                    .from('coach_messages')
                    .select('role, content, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(10),

                // 5. Memory Facts (Confidence > 0.8)
                supabase
                    .from('memory_facts')
                    .select('key, value, confidence')
                    .eq('user_id', userId)
                    .gte('confidence', 0.8),

                // 6. User Profile (Status/Energy)
                supabase
                    .from('profiles')
                    .select('bio_data') // extracted energy/mood often stored here or separate table
                    .eq('id', userId)
                    .single()
            ]);

            // Reverse history to be chronological
            const chronologicalHistory = (history.data || []).reverse();

            return {
                schedule: schedule.data || [],
                goals: goals.data || [],
                anchors: anchors.data || [],
                history: chronologicalHistory,
                facts: facts.data || [],
                userState: profile.data?.bio_data || {}
            };

        } catch (error) {
            console.error('[ContextService] Failed to load context:', error);
            // Return empty context rather than crashing, to allow partial function
            return {
                schedule: [],
                goals: [],
                anchors: [],
                history: [],
                facts: []
            };
        }
    }
}
