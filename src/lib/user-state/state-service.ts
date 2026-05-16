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

        // 3. Fetch Inputs: Latest Brain Dump (Sentiment)
        const { data: latestDump } = await supabase
            .from('brain_dump_entries')
            .select('extracted_json, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Determine sentiment from signals (Naive check for "tired", "anxious")
        // We assume extracted_signals contains tags or keywords
        // For Phase 1, we look for explicit tags in JSON.
        // TODO: Refine this logic with Phase 2 Extractor updates.
        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        // Check for extracted signals in JSON
        const signals = latestDump?.extracted_json?.signals || latestDump?.extracted_json?.extracted_signals || [];

        if (signals.length > 0) {

            // Check recent dump (within 24h)
            if (latestDump && new Date(latestDump.created_at) > subDays(now, 1)) {
                const textJson = JSON.stringify(signals).toLowerCase();
                if (textJson.includes('tired') || textJson.includes('overwhelmed') || textJson.includes('anxious')) {
                    sentiment = 'negative';
                } else if (textJson.includes('excited') || textJson.includes('ready')) {
                    sentiment = 'positive';
                }
            }
        }

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
