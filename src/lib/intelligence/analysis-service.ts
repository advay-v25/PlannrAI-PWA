
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScheduleBlock, DailyStats } from '@/types/database';
import { differenceInMinutes, parseISO } from 'date-fns';

export class AnalysisService {

    /**
     * computeLoad: Calculates load metrics for a given day.
     * Triggers whenever the schedule changes significantly (or via cron/hook).
     */
    static async computeDailyLoad(userId: string, date: string, supabase: SupabaseClient): Promise<DailyStats> {
        // 1. Fetch Blocks
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*, goal:goals(energy_demand, category)')
            .eq('user_id', userId)
            .eq('date', date)
            .neq('status', 'missed') // Only count planned/done
            .order('start_time');

        if (!blocks || blocks.length === 0) {
            return this.saveStats(userId, date, {
                total_active_mins: 0,
                fragmentation_score: 0,
                cognitive_load_score: 0,
                physical_load_score: 0,
                dominant_mode: 'recovery'
            }, supabase);
        }

        // 2. Metrics Calculation
        let totalMins = 0;
        let switches = 0;
        let cognitiveLoad = 0;
        let physicalLoad = 0;
        let lastEndTime = '';

        for (const block of blocks) {
            const duration = this.getDuration(block);
            totalMins += duration;

            // Fragmentation: Context switches
            if (lastEndTime && block.start_time !== lastEndTime) {
                // Gap exists = switch
                // If gap < 15 mins, it's a tight switch. If > 60, it's a break (good).
                const gap = this.timeDiff(lastEndTime, block.start_time);
                if (gap < 30) switches++;
            }
            lastEndTime = block.end_time;

            // Load
            const intensity = this.getIntensity(block);
            if (block.goal?.category === 'body' || block.block_type === 'routine') {
                physicalLoad += (duration / 60) * intensity;
            } else {
                cognitiveLoad += (duration / 60) * intensity;
            }
        }

        // Normalize Scores (0-10 scale approximation)
        // Assume 8 hours of 'medium' work = 8 * 2 = 16 points -> scaled to 10?
        // Let's cap at 10.
        const cScore = Math.min(10, cognitiveLoad * 1.5);
        const pScore = Math.min(10, physicalLoad * 2);

        // Fragmentation: > 5 switches is high.
        const fScore = Math.min(1, switches / 8);

        // Dominant Mode
        let mode: DailyStats['dominant_mode'] = 'mixed';
        if (cScore > 6 && fScore < 0.4) mode = 'focus';
        if (cScore > 5 && fScore > 0.6) mode = 'admin';
        if (cScore < 3 && pScore < 3) mode = 'recovery';

        return this.saveStats(userId, date, {
            total_active_mins: totalMins,
            fragmentation_score: fScore,
            cognitive_load_score: Number(cScore.toFixed(1)),
            physical_load_score: Number(pScore.toFixed(1)),
            dominant_mode: mode
        }, supabase);
    }

    private static async saveStats(userId: string, date: string, stats: Partial<DailyStats>, supabase: SupabaseClient) {
        const { data, error } = await supabase
            .from('daily_stats')
            .upsert({
                user_id: userId,
                date,
                ...stats,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, date' })
            .select()
            .single();

        if (error) console.error("Failed to save daily stats", error);
        return data as DailyStats;
    }

    // --- Helpers ---
    private static getDuration(block: any) {
        return differenceInMinutes(
            parseISO(`2000-01-01T${block.end_time}`),
            parseISO(`2000-01-01T${block.start_time}`)
        );
    }

    private static timeDiff(start: string, end: string) {
        return differenceInMinutes(
            parseISO(`2000-01-01T${end}`),
            parseISO(`2000-01-01T${start}`)
        );
    }

    private static getIntensity(block: any): number {
        // Base mapping
        const map: Record<string, number> = {
            'heavy': 3,
            'medium': 2,
            'light': 1
        };
        // Retrieve from Goal or default
        if (block.goal?.energy_demand) return map[block.goal.energy_demand] || 2;
        if (block.block_type === 'focus') return 3;
        if (block.block_type === 'admin') return 1;
        return 2; // Default
    }
}
