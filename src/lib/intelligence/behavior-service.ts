import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

export type BehaviorAction = 'complete' | 'miss' | 'reschedule' | 'overrun' | 'accept_suggestion' | 'reject_suggestion' | 'delete';

export interface SignalMeta {
    goal_id?: string;
    block_id?: string;
    title?: string;
    intensity?: number; // 1-10 (calculated or provided)
    from_time?: string;
    to_time?: string;
    duration_change?: number;
    context?: string;
}

export class BehaviorService {
    static async logSignal(
        userId: string,
        action: BehaviorAction,
        meta: SignalMeta = {},
        supabase?: SupabaseClient
    ) {
        const client = supabase ?? await createClient();

        // 1. Log the Raw Signal
        const { error } = await client
            .from('behavior_events')
            .insert({
                user_id: userId,
                action_type: action,
                meta: meta,
                event_id: meta.block_id
            });

        if (error) {
            console.error('[BehaviorService] Signal Log Error:', error);
            return { success: false, error };
        }

        // 2. Immediate Pattern Resonance (Optional: Update daily stats or patterns)
        // If it's a 'complete' action and it's a high-intensity block (like CFA), 
        // we might want to flag the need for recovery.
        if (action === 'complete' && meta.title?.toLowerCase().includes('cfa')) {
            await this.triggerRecoveryResonance(userId, client);
        }

        return { success: true };
    }

    private static async triggerRecoveryResonance(userId: string, client: SupabaseClient) {
        const date = new Date().toISOString().split('T')[0];

        // Boost cognitive load for the day
        const { data: stats } = await client
            .from('daily_stats')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        if (stats) {
            await client
                .from('daily_stats')
                .update({
                    cognitive_load_score: Math.min(10, (stats.cognitive_load_score || 0) + 4),
                    dominant_mode: 'recovery'
                })
                .eq('id', stats.id);
        } else {
            await client
                .from('daily_stats')
                .insert({
                    user_id: userId,
                    date: date,
                    cognitive_load_score: 8,
                    dominant_mode: 'recovery'
                });
        }
    }
}
