
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { DailyStats, Profile, Goal, BehaviorPattern } from '@/types/database';

export interface OptimizationContext {
    userId: string;
    profile: Profile;
    goals: Goal[];
    stats: DailyStats | null;
    patterns: BehaviorPattern | null;

    // Derived Metrics
    computedMode: 'focus' | 'recovery' | 'maintenance' | 'survival';
    energyCapacity: number; // 0-100
    suggestedBufferMins: number; // e.g. 15, 30
    densityLimit: number; // 0-1 (Max fraction of day to book)
    recentSignals: any[]; // Recent behavior events
    weeklyGoalCounts: Record<string, number>; // { goalId: count }
    userContext: any[]; // Long-term memory facts/patterns
}

export class ContextEngine {

    /**
     * Builds the full context for a user for a specific date (default today).
     */
    static async build(userId: string, date: string, supabase?: SupabaseClient): Promise<OptimizationContext> {
        const client = supabase ?? await createClient();

        // Parallel Fetch
        const [
            { data: profile },
            { data: goals },
            { data: stats },
            { data: patterns },
            { data: behaviorEventsData },
            weeklyGoalCounts,
            { data: userContextData }
        ] = await Promise.all([
            client.from('profiles').select('*').eq('id', userId).single(),
            client.from('goals').select('*').eq('user_id', userId).eq('status', 'active'),
            client.from('daily_stats').select('*').eq('user_id', userId).eq('date', date).single(),
            client.from('behavior_patterns').select('*').eq('user_id', userId).single(),
            client.from('behavior_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
            this.fetchWeeklyGoalCounts(client, userId, date),
            client.from('user_context').select('*').eq('user_id', userId).order('confidence', { ascending: false }).limit(10)
        ]);

        const recentSignals = behaviorEventsData || [];

        if (!profile) throw new Error("Profile not found");

        // Compute Derived Metrics
        const energyCapacity = this.computeEnergyCapacity(profile, stats);
        const computedMode = this.deriveMode(energyCapacity, stats);
        const suggestedBufferMins = this.calculateBuffer(profile, computedMode);
        const densityLimit = this.calculateDensityLimit(computedMode);

        return {
            userId,
            profile: profile as Profile,
            goals: (goals as Goal[]) || [],
            stats: (stats as DailyStats) || null,
            patterns: (patterns as BehaviorPattern) || null,
            computedMode,
            energyCapacity,
            suggestedBufferMins,
            densityLimit,
            recentSignals,
            weeklyGoalCounts: weeklyGoalCounts || {},
            userContext: userContextData || []
        };
    }

    private static async fetchWeeklyGoalCounts(client: SupabaseClient, userId: string, date: string): Promise<Record<string, number>> {
        const targetDate = new Date(date);
        const start = new Date(targetDate);
        start.setDate(targetDate.getDate() - targetDate.getDay() + (targetDate.getDay() === 0 ? -6 : 1)); // Monday
        const end = new Date(start);
        end.setDate(start.getDate() + 6); // Sunday

        const { data: blocks } = await client
            .from('schedule_blocks')
            .select('goal_id')
            .eq('user_id', userId)
            .gte('date', start.toISOString().split('T')[0])
            .lte('date', end.toISOString().split('T')[0])
            .not('goal_id', 'is', null);

        const counts: Record<string, number> = {};
        blocks?.forEach(b => {
            if (b.goal_id) {
                counts[b.goal_id] = (counts[b.goal_id] || 0) + 1;
            }
        });
        return counts;
    }

    // --- Derivation Logic ---

    private static computeEnergyCapacity(profile: Profile, stats: DailyStats | null, signals: any[] = []): number {
        let base = profile.energy_level ? profile.energy_level * 20 : 60; // 1-5 -> 20-100

        // Behavioral Resonance: Check for high-intensity signals in the last 4 hours
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        const highIntensitySignal = signals.find(s =>
            s.created_at >= fourHoursAgo &&
            (s.meta?.title?.toLowerCase().includes('cfa') || s.meta?.intensity > 7)
        );

        if (highIntensitySignal) {
            console.log('[ContextEngine] Found high intensity signal, reducing energy capacity');
            base *= 0.5; // Significant drop for recovery
        }

        if (profile.low_energy_mode) base *= 0.6;
        if (stats && stats.cognitive_load_score > 8) base -= 20; // Heavy load reduces capacity
        if (stats && stats.physical_load_score > 8) base -= 10;

        return Math.max(10, Math.min(100, base));
    }

    private static deriveMode(capacity: number, stats: DailyStats | null): OptimizationContext['computedMode'] {
        if (capacity < 30) return 'survival';
        if (capacity < 50) return 'recovery';

        // If high capacity, check if we are already overloaded
        if (stats && stats.fragmentation_score > 0.8) return 'maintenance'; // Too choppy, stabilize

        return 'focus';
    }

    private static calculateBuffer(profile: Profile, mode: OptimizationContext['computedMode']): number {
        const base = profile.buffer_config?.gap_mins || 15;

        switch (mode) {
            case 'survival': return Math.max(30, base * 2);
            case 'recovery': return Math.max(20, base * 1.5);
            case 'maintenance': return base;
            case 'focus': return Math.min(10, base); // Tighten up for flow
        }
    }

    private static calculateDensityLimit(mode: OptimizationContext['computedMode']): number {
        switch (mode) {
            case 'survival': return 0.4; // Only 40% of day
            case 'recovery': return 0.6;
            case 'maintenance': return 0.8;
            case 'focus': return 0.9;
        }
    }
}
