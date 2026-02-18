
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { startOfDay, endOfDay, addDays, format } from 'date-fns';

export interface LiquidContext {
    user: {
        id: string;
        name: string;
        timezone: string;
        preferences: any;
    };
    state: {
        energy_level: number; // 1-10 (default 7)
        mood: string;
        last_log: string | null;
        current_time: string;
    };
    schedule: {
        today: any[];
        tomorrow: any[];
        conflicts: any[];
        stats: {
            total_focus_time: number;
            meetings_count: number;
        };
    };
    goals: {
        active: any[];
        pending_action: number;
    };
    anchors: any[];
    _debug_sizes?: any;
}

export class ContextService {
    /**
     * Aggregates all user state into a single "Liquid Context" object.
     * This is the "Brain" of the system.
     */
    static async getLiquidContext(userId: string): Promise<LiquidContext> {
        const supabase = await createClient();

        const today = new Date();
        const tomorrow = addDays(today, 1);
        const todayStr = format(today, 'yyyy-MM-dd');
        const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

        // 1. Parallel Fetching for Speed
        const [
            profileRes,
            prefsRes,
            todayBlocksRes,
            tomorrowBlocksRes,
            goalsRes,
            commitmentsRes,
            dailyLogRes
        ] = await Promise.all([
            supabase.from('profiles').select('full_name, timezone').eq('id', userId).single(),
            supabase.from('profile_preferences').select('*').eq('user_id', userId).single(),
            supabase.from('schedule_blocks').select('id, title, start_time, end_time, is_focus, pillar, block_type').eq('user_id', userId).eq('date', todayStr).order('start_time'),
            supabase.from('schedule_blocks').select('id, title, start_time, end_time, is_focus').eq('user_id', userId).eq('date', tomorrowStr).order('start_time'),
            supabase.from('goals').select('id, title, category, importance').eq('user_id', userId).eq('status', 'active').limit(10),
            supabase.from('commitments').select('id, title, start_time, end_time, days_of_week').eq('user_id', userId).eq('is_active', true).limit(20),
            supabase.from('daily_logs').select('energy_level, mood, created_at').eq('user_id', userId).eq('log_date', todayStr).single()
        ]);

        // 2. Process User & Preferences
        const profile = profileRes.data || { full_name: 'User', timezone: 'UTC' };
        const prefs = prefsRes.data || {};

        // 3. Process Schedule Stats
        const todayBlocks = todayBlocksRes.data || [];
        const focusBlocks = todayBlocks.filter(b => b.is_focus || b.pillar === 'Work');
        const totalFocusMins = focusBlocks.reduce((acc, b) => {
            const start = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
            const end = parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1]);
            return acc + (end - start);
        }, 0);

        // 4. Process Bio-State (from Daily Log or defaults)
        const dailyLog = dailyLogRes.data;
        const energyLevel = dailyLog?.energy_level ?? 7;
        const mood = dailyLog?.mood ?? 'neutral';

        const validContext: LiquidContext = {
            user: {
                id: userId,
                name: profile.full_name || 'User',
                timezone: profile.timezone || 'UTC',
                preferences: prefs
            },
            state: {
                energy_level: energyLevel,
                mood,
                last_log: dailyLog?.created_at || null,
                current_time: new Date().toISOString()
            },
            schedule: {
                today: todayBlocks,
                tomorrow: tomorrowBlocksRes.data || [],
                conflicts: [], // TODO: Run conflict detection here
                stats: {
                    total_focus_time: totalFocusMins,
                    meetings_count: todayBlocks.filter(b => !b.is_focus).length
                }
            },
            goals: {
                active: goalsRes.data || [],
                pending_action: (goalsRes.data || []).length
            },
            anchors: commitmentsRes.data || []
        };

        const sizes = {
            user: JSON.stringify(validContext.user).length,
            state: JSON.stringify(validContext.state).length,
            schedule: JSON.stringify(validContext.schedule).length,
            goals: JSON.stringify(validContext.goals).length,
            anchors: JSON.stringify(validContext.anchors).length
        };
        console.log('[ContextService] Sizes:', sizes);

        return { ...validContext, _debug_sizes: sizes };
    }

    /**
     * Determines the User's "Mode" based on context.
     * e.g. "Overwhelmed", "Flow", "Recovery"
     */
    static deriveSystemMode(context: LiquidContext): 'normal' | 'overwhelmed' | 'recovery' | 'flow' {
        const { state, schedule, user } = context;

        // 1. Check strict overrides
        if (user.preferences.low_energy_mode) return 'recovery';
        if (user.preferences.overwhelm_mode) return 'overwhelmed';

        // 2. Check derived state
        if (state.energy_level <= 3) return 'recovery';

        // 3. Check load
        const loadRatio = schedule.stats.total_focus_time / (8 * 60); // Assuming 8h capacity
        if (loadRatio > 0.9) return 'overwhelmed';

        // 4. Check Focus
        if (schedule.stats.total_focus_time > 120 && state.energy_level > 7) return 'flow';

        return 'normal';
    }
    /**
     * Snapshots the current context to the DB for debugging and history.
     */
    static async saveSnapshot(userId: string, context: LiquidContext, eventType: string = 'manual'): Promise<void> {
        const supabase = await createClient();
        await supabase.from('context_snapshots').insert({
            user_id: userId,
            context_data: context,
            event_type: eventType
        });
    }
}
