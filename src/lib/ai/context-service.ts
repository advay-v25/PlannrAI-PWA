
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
    ai_profile?: any;
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

        // Safe query wrapper — prevents missing tables from crashing the entire context
        const safeQuery = async (fn: () => any, fallback: any): Promise<any> => {
            try {
                const result = await Promise.resolve(fn());
                if (result?.error) {
                    console.warn('[ContextService] Query warning:', result.error.message);
                    return fallback;
                }
                return result?.data ?? fallback;
            } catch (e: any) {
                console.warn('[ContextService] Query failed:', e.message);
                return fallback;
            }
        };

        // 1. Parallel Fetching for Speed
        const [
            profile,
            prefs,
            todayBlocks,
            tomorrowBlocks,
            goals,
            commitments,
            dailyLog
        ] = await Promise.all([
            safeQuery(() => supabase.from('profiles').select('full_name, timezone, bio_data').eq('id', userId).single(), { full_name: 'User', timezone: 'UTC', bio_data: null }),
            safeQuery(() => supabase.from('profile_preferences').select('*').eq('user_id', userId).single(), {}),
            safeQuery(() => supabase.from('schedule_blocks').select('id, title, start_time, end_time, pillar, block_type').eq('user_id', userId).eq('date', todayStr).order('start_time'), []),
            safeQuery(() => supabase.from('schedule_blocks').select('id, title, start_time, end_time, block_type').eq('user_id', userId).eq('date', tomorrowStr).order('start_time'), []),
            safeQuery(() => supabase.from('goals').select('id, title, category, importance').eq('user_id', userId).eq('status', 'active').limit(10), []),
            safeQuery(() => supabase.from('commitments').select('id, title, start_time, end_time, days_of_week').eq('user_id', userId).eq('is_active', true).limit(20), []),
            safeQuery(() => supabase.from('daily_logs').select('energy_level, mood, created_at').eq('user_id', userId).eq('log_date', todayStr).single(), null)
        ]);

        // 2. Process User & Preferences
        const aiProfile = (profile as any).bio_data?.ai_profile || null;

        // 3. Process Schedule Stats
        const focusBlocks = todayBlocks.filter((b: any) => b.block_type === 'goal' || b.block_type === 'anchor' || b.pillar === 'Work');
        const totalFocusMins = focusBlocks.reduce((acc: number, b: any) => {
            const start = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
            const end = parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1]);
            return acc + (end - start);
        }, 0);

        // 4. Process Bio-State (from Daily Log or defaults)
        const energyLevel = dailyLog?.energy_level ?? 7;
        const mood = dailyLog?.mood ?? 'neutral';

        // 5. Detect Schedule Conflicts
        const detectConflicts = (blocks: any[], date: string) => {
            const conflicts = [];
            for (let i = 0; i < blocks.length - 1; i++) {
                const current = blocks[i];
                const next = blocks[i + 1];
                // start_time and end_time are comparable strings like "09:00:00"
                if (current.end_time > next.start_time) {
                    conflicts.push({
                        date,
                        block1: current,
                        block2: next,
                        type: 'overlap'
                    });
                }
            }
            return conflicts;
        };

        const allConflicts = [
            ...detectConflicts(todayBlocks, todayStr),
            ...detectConflicts(tomorrowBlocks, tomorrowStr)
        ];

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
                tomorrow: tomorrowBlocks,
                conflicts: allConflicts,
                stats: {
                    total_focus_time: totalFocusMins,
                    meetings_count: todayBlocks.filter((b: any) => b.block_type !== 'goal' && b.block_type !== 'anchor').length
                }
            },
            goals: {
                active: goals,
                pending_action: goals.length
            },
            anchors: commitments,
            ai_profile: aiProfile
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
        try {
            const supabase = await createClient();
            await supabase.from('context_snapshots').insert({
                user_id: userId,
                context_data: context,
                event_type: eventType
            });
        } catch (e: any) {
            console.warn('[ContextService] Snapshot save failed:', e.message);
        }
    }
}
