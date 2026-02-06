import { createClient } from '@/lib/supabase/server';
import { BehaviorEvent, BehaviorPattern } from '@/types/database';
import { SupabaseClient } from '@supabase/supabase-js';

export class BehaviorService {
    /**
     * Record a raw behavior event
     */
    static async record(userId: string, event: Omit<BehaviorEvent, 'id' | 'created_at' | 'user_id'>, injectedClient?: SupabaseClient) {
        console.log("   [BehaviorService] record called. Has Client:", !!injectedClient);
        const supabase = injectedClient ?? await createClient();

        const { error } = await supabase.from('behavior_events').insert({
            user_id: userId,
            ...event
        });

        if (error) {
            console.error("   [BehaviorService] Insert Error:", error);
        }
    }

    /**
     * Get the latest patterns for a user
     */
    static async getPatterns(userId: string): Promise<BehaviorPattern | null> {
        const supabase = await createClient();

        const { data } = await supabase
            .from('behavior_patterns')
            .select('*')
            .eq('user_id', userId)
            .single();

        return data;
    }

    /**
     * Compute patterns (Heavy operation - usually scheduled)
     * For MVP, we can call this sparingly.
     */
    static async computePatterns(userId: string) {
        // TODO: Implement aggregation logic
        // 1. Fetch last 30 days of events
        // 2. Calculate completion rates per category
        // 3. Identification of "preferred windows" based on completion timestamps
        // 4. Update behavior_patterns table
    }
}
