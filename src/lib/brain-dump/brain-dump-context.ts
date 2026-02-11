import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, endOfDay, addDays } from 'date-fns';

/**
 * Brain Dump Context
 * 
 * Aggregates all necessary context for the "Reality Intake" engine to make
 * intelligent decisions about schedule patches.
 */

export interface BrainDumpContext {
    now: string;
    timezone: string;
    emotional_state: {
        current: string | null;  // e.g. "overwhelmed", "focused"
        energy_level: number | null; // 1-10
    };
    schedule: Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        block_type: string;
        is_locked: boolean;
    }>;
    goals: Array<{
        title: string;
        priority: string;
    }>;
    recent_extractions: Array<{
        text_snippet: string;
        created_at: string;
        signals: any;
    }>;
}

export async function buildBrainDumpContext(
    userId: string,
    supabase: SupabaseClient
): Promise<BrainDumpContext> {
    const now = new Date();
    const rangeStart = startOfDay(now);
    const rangeEnd = endOfDay(addDays(now, 7));

    // Parallel fetch
    const [profileRes, scheduleRes, goalsRes, extractionsRes] = await Promise.all([
        // 1. Profile / State
        supabase
            .from('profiles')
            .select('timezone, emotional_state, current_energy_level')
            .eq('id', userId)
            .single(),

        // 2. Schedule (Today + 7 days)
        supabase
            .from('schedule_blocks')
            .select('id, title, start_time, end_time, block_type, is_locked')
            .eq('user_id', userId)
            .gte('start_time', rangeStart.toISOString())
            .lte('start_time', rangeEnd.toISOString())
            .order('start_time', { ascending: true }),

        // 3. Active Goals
        supabase
            .from('goals')
            .select('title, priority')
            .eq('user_id', userId)
            .eq('status', 'active'),

        // 4. Recent Extractons (Last 5)
        supabase
            .from('brain_dump_extractions')
            .select('created_at, extracted_json, brain_dumps(text)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5)
    ]);

    const profile = profileRes.data;

    const extractions = (extractionsRes.data || []).map((e: any) => ({
        text_snippet: (e.brain_dumps?.text || '').slice(0, 100),
        created_at: e.created_at,
        signals: e.extracted_json?.signals || {},
    }));

    return {
        now: now.toISOString(),
        timezone: profile?.timezone || 'Asia/Kolkata',
        emotional_state: {
            current: profile?.emotional_state || null,
            energy_level: profile?.current_energy_level || null,
        },
        schedule: (scheduleRes.data || []).map(b => ({
            id: b.id,
            title: b.title,
            start_time: b.start_time,
            end_time: b.end_time,
            block_type: b.block_type || 'task',
            is_locked: b.is_locked || false,
        })),
        goals: (goalsRes.data || []).map(g => ({
            title: g.title,
            priority: g.priority || 'medium',
        })),
        recent_extractions: extractions,
    };
}

// ── Persistence Helpers ──────────────────────────────────────────────

export async function saveBrainDump(
    userId: string,
    text: string,
    supabase: SupabaseClient
): Promise<string> {
    const { data, error } = await supabase
        .from('brain_dumps')
        .insert({ user_id: userId, text })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
}

export async function saveBrainDumpExtraction(
    userId: string,
    dumpId: string,
    extraction: any,
    supabase: SupabaseClient
): Promise<void> {
    const { error } = await supabase
        .from('brain_dump_extractions')
        .insert({
            user_id: userId,
            brain_dump_id: dumpId,
            extracted_json: extraction
        });

    if (error) console.error("Failed to save extraction", error);
}

export async function updateUserStateFromSignals(
    userId: string,
    signals: { energy_delta?: number; overwhelm?: number; sentiment?: number },
    supabase: SupabaseClient
): Promise<void> {
    if (!signals) return;

    // Simple logic: If overwhelm > 0.7, set state to 'overwhelmed'.
    // If energy delta negative, subtract from current.

    if (signals.overwhelm && signals.overwhelm > 0.7) {
        await supabase.from('profiles').update({ emotional_state: 'overwhelmed' }).eq('id', userId);
    }

    // Future: fancier logic
}
