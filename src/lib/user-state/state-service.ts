import { createClient } from '@/lib/supabase/server';
import { StateEngine, StateInputs, BASELINE_STATE } from './state-engine';
import { UserState } from '../agents/core/types';
import { startOfDay, subDays, endOfDay } from 'date-fns';

import { SupabaseClient } from '@supabase/supabase-js';

export class StateService {
    /**
     * Re-calculates and persists the user's state based on recent history.
     */
    static async refreshState(userId: string, injectedClient?: SupabaseClient): Promise<UserState> {
        const supabase = injectedClient ?? await createClient();
        const now = new Date();
        const yesterday = subDays(now, 1);

        // 1. Fetch Current State (to use as baseline if needed)
        const { data: currentStateRow } = await supabase
            .from('user_states')
            .select('*')
            .eq('user_id', userId)
            .single();

        const currentState: UserState = currentStateRow ? {
            energy_level: currentStateRow.energy_level,
            cognitive_load: currentStateRow.cognitive_load,
            emotional_bandwidth: currentStateRow.emotional_bandwidth,
            current_mode: currentStateRow.current_mode,
            emotional_state: currentStateRow.emotional_state || 'coasting',
            last_updated: new Date(currentStateRow.updated_at)
        } : BASELINE_STATE;

        // 2. Fetch Inputs: Schedule Performance (Yesterday + Today so far)
        // We look at "Yesterday" to see if they are dragging fatigue.
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('status, start_time, end_time')
            .eq('user_id', userId)
            .gte('date', startOfDay(yesterday).toISOString())
            .lte('date', endOfDay(now).toISOString());

        const totalBlocks = blocks?.length || 0;
        const missedBlocks = blocks?.filter(b => b.status === 'missed').length || 0;
        const completedBlocks = blocks?.filter(b => b.status === 'done').length || 0;
        const completionRate = totalBlocks > 0 ? (completedBlocks / totalBlocks) : 1.0;

        // 3. Determine sentiment (Defaulting to neutral, previously from Brain Dump)
        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';

        // 4. Construct Inputs
        const inputs: StateInputs = {
            currentDate: now,
            missedBlocksCount: missedBlocks,
            completionRate: completionRate,
            sentiment: sentiment,
            // Sleep is undetermined for now, Engine handles undefined.
        };

        // 5. Calculate Next State
        const nextState = StateEngine.calculateNextState(currentState, inputs);

        // 6. Persist
        const { error } = await supabase.from('user_states').upsert({
            user_id: userId,
            energy_level: nextState.energy_level,
            cognitive_load: nextState.cognitive_load,
            emotional_bandwidth: nextState.emotional_bandwidth,
            current_mode: nextState.current_mode,
            emotional_state: nextState.emotional_state,
            updated_at: now.toISOString()
        });

        if (error) {
            console.error("Failed to persist user state:", error);
        }

        return nextState;
    }

    /**
     * Lightweight getter
     */
    static async getState(userId: string, injectedClient?: SupabaseClient): Promise<UserState> {
        const supabase = injectedClient ?? await createClient();
        const { data } = await supabase
            .from('user_states')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!data) return BASELINE_STATE;

        return {
            energy_level: data.energy_level,
            cognitive_load: data.cognitive_load,
            emotional_bandwidth: data.emotional_bandwidth,
            current_mode: data.current_mode,
            emotional_state: data.emotional_state || 'coasting',
            last_updated: new Date(data.updated_at)
        };
    }
}
