import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { GoalScheduler } from '@/lib/scheduling/goal-scheduler';
import { SchedulingProtocol, type MoodLevel } from '@/lib/scheduling/protocol';
import { addDays, format } from 'date-fns';

export class ReactiveGoalService {
    /**
     * React to a Goal Update/Creation.
     * Now energy-aware: checks user's current energy/mood to decide
     * whether to auto-place sessions or defer to tomorrow.
     */
    static async onGoalUpdated(userId: string, goalId: string, injectedClient?: SupabaseClient) {
        const supabase = injectedClient ?? await createClient();

        // 1. Fetch the Goal
        const { data: goal } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goalId)
            .single();

        if (!goal) return;

        // 2. Fetch current energy/mood state
        const { data: userState } = await supabase
            .from('user_states')
            .select('energy_level, emotional_state')
            .eq('user_id', userId)
            .maybeSingle();

        const energy = userState?.energy_level || 3;
        const mood: MoodLevel = (userState?.emotional_state as MoodLevel) || 'neutral';
        const scheduleMode = SchedulingProtocol.computeMode({ energy, mood });

        console.log(`[ReactiveGoal] Goal "${goal.title}" updated. Protocol: ${scheduleMode.strategy} (energy=${energy}, mood=${mood})`);

        // 3. Fetch Schedule Context (Next 7 days)
        const today = new Date();
        const nextWeek = addDays(today, 7);
        const { data: schedule } = await supabase
            .from('schedule_blocks')
            .select('start_time, end_time, date, is_fixed, block_type')
            .eq('user_id', userId)
            .gte('date', format(today, 'yyyy-MM-dd'))
            .lte('date', format(nextWeek, 'yyyy-MM-dd'));

        // 4. Generate Proposal
        const patch = GoalScheduler.proposeGoalSchedule(goal, schedule || []);

        if (!patch || patch.changes.length === 0) return;

        // 5. Energy-aware decision: auto-place or defer
        const { MemoryService } = await import('@/lib/services/memory-service');
        const conversation = await MemoryService.getLatestConversation(userId, 'coach');

        let messageText: string;
        let recommended = true;

        if (scheduleMode.strategy === 'recovery') {
            // Low energy: Don't suggest adding more work today
            messageText = `You updated "${goal.title}", but you're in Recovery Mode right now. I'll schedule sessions starting tomorrow when you have more energy.`;
            recommended = false;
        } else if (scheduleMode.strategy === 'momentum') {
            // High energy: Enthusiastically suggest auto-placing
            messageText = `You're in Momentum Mode! I've prepared ${patch.changes.length} sessions for "${goal.title}" — let's capitalize on your energy.`;
            recommended = true;
        } else {
            // Balanced: Standard proposal
            messageText = `I noticed you updated "${goal.title}". I've prepared a schedule adjustment for it.`;
            recommended = true;
        }

        if (conversation) {
            const messageContent = JSON.stringify({
                text: messageText,
                options: [
                    {
                        id: `goal_sync_${Date.now()}`,
                        title: 'Apply Schedule Adjustment',
                        description: `Places ${patch.changes.length} sessions in your calendar${scheduleMode.strategy === 'recovery' ? ' (starting tomorrow)' : ''}.`,
                        impact: 'Updates calendar seamlessly',
                        patch: {
                            ops: patch.changes,
                            undoable: true
                        },
                        recommended
                    }
                ],
                metadata: {
                    type: 'proposal_card',
                    schedule_mode: scheduleMode.strategy,
                }
            });

            await MemoryService.addCoachMessage(
                userId,
                conversation.id,
                'assistant',
                messageContent,
                false // Don't trigger extraction for assistant messages
            );
        }

        // 6. Pipeline Trigger: Set needs_rescheduling flag for Proactive Banner / Home Page
        const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', userId).single();
        if (profile) {
            const bioData = (profile.bio_data as any) || {};
            await supabase.from('profiles').update({
                bio_data: {
                    ...bioData,
                    needs_rescheduling: true,
                    pending_goal_update: goal.title,
                    pending_goal_id: goal.id,
                    schedule_mode: scheduleMode.strategy,
                }
            }).eq('id', userId);
        }
    }
}
