import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';

export const GET = secureApiRoute(
    async (request, { supabase, userId }) => {
        try {
            // Check proactive trigger: look at today's schedule for anomalies
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();
            const currentHour = now.getHours();

        const { data: todayBlocks } = await supabase
            .from('schedule_blocks')
            .select('id, title, status, start_time, end_time, block_type')
            .eq('user_id', user.id)
            .eq('date', today);

        const blocks = todayBlocks || [];
        const missedBlocks = blocks.filter((b: any) => {
            if (b.status !== 'planned') return false;
            const endHour = parseInt((b.end_time || '00:00').split(':')[0]);
            return endHour < currentHour;
        });

        const completedBlocks = blocks.filter((b: any) => b.status === 'completed');

        // Check for needs_rescheduling flag in profile bio_data
        const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', user.id).single();
        const bioData = (profile?.bio_data as any) || {};
        const needsRescheduling = bioData.needs_rescheduling === true;
        const pendingGoal = bioData.pending_goal_update || 'your settings';

        // Generate a proactive suggestion based on schedule state
        let suggestion = null;

        if (needsRescheduling) {
            suggestion = {
                id: 'settings-sync-needed',
                dismiss_uid: `settings-sync-${today}`,
                trigger_type: 'settings_updated',
                title: 'Schedule Synchronization Required',
                message: `I noticed you updated ${pendingGoal}. Should I re-optimize your calendar to fit the new anchors in?`,
                action_label: 'Sync Calendar',
                query: `I just updated ${pendingGoal}. Please re-optimize my week to fit the new anchors properly.`,
                priority: 'high',
            };
            
            // Note: Flag is now cleared only upon user action (dismiss/apply)

        } else if (missedBlocks.length >= 3) {
            suggestion = {
                id: 'missed-blocks',
                dismiss_uid: `missed-${today}`,
                trigger_type: 'missed_blocks',
                title: `${missedBlocks.length} blocks missed today`,
                message: `You've missed ${missedBlocks.length} scheduled blocks today. Want me to help you adapt the rest of your day?`,
                action_label: 'Adjust Day',
                query: `I missed ${missedBlocks.length} blocks today. Help me adapt the rest of my day.`,
                priority: 'high',
            };
        } else if (blocks.length === 0 && currentHour >= 8) {
            suggestion = {
                id: 'no-schedule',
                dismiss_uid: `empty-${today}`,
                trigger_type: 'empty_day',
                title: 'No schedule for today',
                message: 'Your day is unplanned. Want me to build a schedule based on your goals?',
                action_label: 'Plan Today',
                query: 'Plan my day based on my goals and energy.',
                priority: 'medium',
            };
        } else if (completedBlocks.length > 0 && completedBlocks.length === blocks.length) {
            suggestion = {
                id: 'all-done',
                dismiss_uid: `done-${today}`,
                trigger_type: 'all_complete',
                title: 'You\'ve completed everything!',
                message: 'You\'ve finished all your planned blocks. Want to add something productive to the rest of your day?',
                action_label: 'Add More',
                query: 'I finished everything. What productive things can I add to the rest of my day?',
                priority: 'low',
            };
        }

        if (!suggestion) {
            return apiSuccess({
                has_suggestion: false,
            });
        }

        return apiSuccess({
            has_suggestion: true,
            suggestion,
        });

    } catch (error) {
        console.error('[Coach Proactive] Error:', error);
        // Always return success with no suggestion on error — never 500 to the user
        return apiSuccess({
            has_suggestion: false,
        });
    }
}, { requireAuth: true, rateLimit: 'aiCoach' });
