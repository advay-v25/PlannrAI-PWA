import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { GoalScheduler } from '@/lib/scheduling/goal-scheduler';
import { addDays, format } from 'date-fns';

export class ReactiveGoalService {
    /**
     * React to a Goal Update/Creation.
     * Generates a proposal and saves it as a system notification/proposal.
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

        // 2. Fetch Schedule Context (Next 7 days)
        const today = new Date();
        const nextWeek = addDays(today, 7);
        const { data: schedule } = await supabase
            .from('schedule_blocks')
            .select('start_time, end_time, date, is_fixed, block_type')
            .eq('user_id', userId)
            .gte('date', format(today, 'yyyy-MM-dd'))
            .lte('date', format(nextWeek, 'yyyy-MM-dd'));

        // 3. Generate Proposal
        const patch = GoalScheduler.proposeGoalSchedule(goal, schedule || []);

        if (!patch || patch.changes.length === 0) return;

        // 4. Save Proposal (to ai_proposals or similar)
        // For now, we will log it as a 'system' proposal in the coach_interactions table
        // or a new 'pending_actions' queue if we had one.
        // Given existing tables, let's inject it into `ai_proposals` if it exists (from Phase 2 audit),
        // OR effectively we want to 'Notify' the user.

        // Let's check if 'ai_proposals' table exists. 
        // Based on previous convos, we wanted to create it.
        // If not, we'll log to console for now, but the Directive says "One Engine".
        // The Engine should probably "Just Do It" if it's high confidence?
        // No, user said "No 'suggested schedules' without commit or refusal".

        // Strategy: Create a "System Message" in the Coach Chat with the proposal.
        // This ensures it appears in the "One Truth" stream.

        const { MemoryService } = await import('@/lib/services/memory-service');
        const conversation = await MemoryService.getLatestConversation(userId, 'coach');

        if (conversation) {
            const messageContent = JSON.stringify({
                text: `I noticed you updated "${goal.title}". I've prepared a schedule adjustment for it.`,
                options: [
                    {
                        id: `goal_sync_${Date.now()}`,
                        title: 'Apply Schedule Adjustment',
                        description: `Automatically places ${patch.changes.length} sessions in your calendar.`,
                        impact: 'Updates calendar seamlessly',
                        patch: {
                            ops: patch.changes,
                            undoable: true
                        },
                        recommended: true
                    }
                ],
                metadata: {
                    type: 'proposal_card'
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

        // 5. Pipeline Trigger: Set needs_rescheduling flag for Proactive Banner / Home Page
        const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', userId).single();
        if (profile) {
            const bioData = (profile.bio_data as any) || {};
            await supabase.from('profiles').update({
                bio_data: {
                    ...bioData,
                    needs_rescheduling: true,
                    pending_goal_update: goal.title,
                    pending_goal_id: goal.id
                }
            }).eq('id', userId);
        }
    }
}
