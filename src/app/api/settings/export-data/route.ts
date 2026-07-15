import { secureApiRoute, apiError } from '@/lib/security/api-protection';
import { NextResponse } from 'next/server';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;

        const safeQuery = async (table: string) => {
            try {
                const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
                if (error) return [];
                return data || [];
            } catch {
                return [];
            }
        };

        const [
            profile,
            profilePreferences,
            goals,
            scheduleBlocks,
            commitments,
            habitStacks,
            habitLogs,
            todoLists,
            todos,
            userState,
            coachConversations,
            coachMessages,
            memoryFacts,
            coachLearnings,
            weeklyReviews,
            energyCheckins,
            behaviorEvents,
            milestones,
            personalRules,
        ] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).single().then(r => r.data),
            supabase.from('profile_preferences').select('*').eq('user_id', userId).single().then(r => r.data),
            safeQuery('goals'),
            safeQuery('schedule_blocks'),
            safeQuery('commitments'),
            safeQuery('habit_stacks'),
            safeQuery('habit_logs'),
            safeQuery('todo_lists'),
            safeQuery('todos'),
            supabase.from('user_states').select('*').eq('user_id', userId).single().then(r => r.data),
            // AI conversations, messages, and learned memory — previously omitted
            // despite the "Download all your data" promise in Settings, and
            // despite the privacy policy stating this content isn't retained.
            safeQuery('coach_conversations'),
            safeQuery('coach_messages'),
            safeQuery('memory_facts'),
            safeQuery('coach_learnings'),
            safeQuery('weekly_reviews'),
            safeQuery('energy_checkins'),
            safeQuery('behavior_events'),
            safeQuery('milestones'),
            safeQuery('personal_rules'),
        ]);

        const exportData = {
            exported_at: new Date().toISOString(),
            user_id: userId,
            schema_note: 'This export includes every personal-data table linked to your account. Contact support if you believe something is missing.',
            profile: profile || null,
            profile_preferences: profilePreferences || null,
            user_state: userState || null,
            goals,
            schedule_blocks: scheduleBlocks,
            commitments,
            habit_stacks: habitStacks,
            habit_logs: habitLogs,
            todo_lists: todoLists,
            todos,
            coach_conversations: coachConversations,
            coach_messages: coachMessages,
            memory_facts: memoryFacts,
            coach_learnings: coachLearnings,
            weekly_reviews: weeklyReviews,
            energy_checkins: energyCheckins,
            behavior_events: behaviorEvents,
            milestones,
            personal_rules: personalRules,
        };

        const jsonString = JSON.stringify(exportData, null, 2);

        return new NextResponse(jsonString, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="plannrai-export-${new Date().toISOString().split('T')[0]}.json"`,
            },
        });
    },
    { requireAuth: true, auditAction: 'data_export' }
);
