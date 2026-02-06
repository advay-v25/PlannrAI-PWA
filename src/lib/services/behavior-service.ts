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
    /**
     * Compute patterns (Heavy operation - usually scheduled)
     */
    static async computePatterns(userId: string) {
        const supabase = await createClient();

        // 1. Fetch recent events (last 100)
        const { data: events } = await supabase
            .from('behavior_events')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (!events || events.length === 0) return;

        // 2. Initialize Aggregates
        // Simple bucket strategy: Morning (5-11), Midday (11-17), Evening (17-22)
        const buckets: Record<string, { attempts: number, successes: number }> = {
            morning: { attempts: 0, successes: 0 },
            midday: { attempts: 0, successes: 0 },
            evening: { attempts: 0, successes: 0 }
        };

        const getBucket = (isoString: string) => {
            const hour = new Date(isoString).getHours();
            if (hour >= 5 && hour < 11) return 'morning';
            if (hour >= 11 && hour < 17) return 'midday';
            if (hour >= 17 && hour < 23) return 'evening';
            return 'night';
        };

        for (const ev of events) {
            const bucket = getBucket(ev.created_at); // simplistic: uses log time. ideally use event target time.
            if (!buckets[bucket]) continue;

            if (ev.action_type === 'accept_suggestion' || ev.action_type === 'complete') {
                buckets[bucket].attempts++;
                buckets[bucket].successes++;
            } else if (ev.action_type === 'reject_suggestion' || ev.action_type === 'miss' || ev.action_type === 'delete') {
                buckets[bucket].attempts++;
            }
        }

        // 3. Determine Patterns
        const preferred_windows: Record<string, string[]> = { general: [] };
        const avoidance_data: Record<string, any> = { resistance_areas: [] };

        Object.entries(buckets).forEach(([time, stats]) => {
            if (stats.attempts < 3) return; // Not enough data
            const rate = stats.successes / stats.attempts;

            if (rate > 0.7) {
                preferred_windows.general.push(time);
            } else if (rate < 0.4) {
                avoidance_data.resistance_areas.push(time);
            }
        });

        // 4. Upsert
        const { error } = await supabase.from('behavior_patterns').upsert({
            user_id: userId,
            preferred_windows,
            avoidance_data,
            completion_rates: {}, // Placeholder
            density_tolerance: {},
            confidence_score: 0.5, // Base confidence
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        if (error) {
            console.error("[BehaviorService] Failed to update patterns:", error);
        } else {
            console.log("[BehaviorService] Patterns updated:", { preferred_windows, avoidance_data });
        }
    }
}
