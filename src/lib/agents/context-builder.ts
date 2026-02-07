import { createClient } from '@/lib/supabase/server';
import { AgentContext } from './core/types';
import { startOfDay, endOfDay } from 'date-fns';
import { SupabaseClient } from '@supabase/supabase-js';
import { StateService } from '@/lib/user-state/state-service';

export class ContextBuilder {
    static async build(userId: string, injectedClient?: SupabaseClient): Promise<AgentContext> {
        const supabase = injectedClient ?? await createClient(); // Use injected or default

        // 1. Fetch Profile (Timezone, Preferences)
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        // 2. Refresh & Fetch User State (The Brain Stem)
        const userState = await StateService.refreshState(userId, supabase);

        // 3. Fetch Schedule (Today + Tomorrow approx)
        const now = new Date();
        const startOfToday = startOfDay(now);
        const endOfToday = endOfDay(now);

        const { data: events } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('start_time', startOfToday.toISOString())
            .lte('end_time', endOfToday.toISOString());

        // 3b. Fetch Anchors (Commitments) & Merge as Fixed Blocks
        const { data: anchors } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true);

        // 3c. Fetch Active Goals
        const { data: goals } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active');

        const mergedSchedule = [...(events || [])];
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...

        if (anchors) {
            anchors.forEach(anchor => {
                if (anchor.days_of_week.includes(dayOfWeek)) {
                    // Convert HH:MM to actual Date for Today
                    const [h, m] = anchor.start_time.split(':').map(Number);
                    const [eh, em] = anchor.end_time.split(':').map(Number);

                    const start = new Date(startOfToday);
                    start.setHours(h, m, 0, 0);

                    const end = new Date(startOfToday);
                    end.setHours(eh, em, 0, 0);

                    // Avoid duplicate if it's already materialized (check by title or overlapping anchor type?)
                    // For now, assume they are NOT materialized.
                    mergedSchedule.push({
                        id: `anchor-${anchor.id}`,
                        user_id: userId,
                        title: anchor.title,
                        start_time: start.toISOString(),
                        end_time: end.toISOString(),
                        is_fixed: true, // CRITICAL: Solver treats this as immutable
                        status: 'planned',
                        block_type: 'anchor',
                        created_at: new Date().toISOString(),
                        context: 'Fixed Commitment'
                    } as any);
                }
            });
        }

        // 4. Fetch Recent Memories (The "One Truth" Stream)
        // We defer this import to avoid circular deps if any
        const { MemoryService } = await import('@/lib/services/memory-service');
        const recentConvo = await MemoryService.getLatestConversation(userId, 'coach', supabase);

        let recentMemories: any[] = [];
        if (recentConvo) {
            recentMemories = await MemoryService.getHistory(recentConvo.id, 30, supabase);
        }

        const recentSignals = await MemoryService.getRecentSignals(userId, 5, supabase);

        // 5. Fetch Behavior Patterns (Phase 4)
        const { BehaviorService } = await import('@/lib/services/behavior-service');
        const behaviorPatterns = await BehaviorService.getPatterns(userId);

        return {
            userId,
            now,
            timezone: profile?.timezone || 'UTC',
            userState,
            currentSchedule: mergedSchedule, // Return merged list
            goals: goals || [],
            recentMemories,
            recentSignals,
            behaviorPatterns // Injected!
        };
    }
}
