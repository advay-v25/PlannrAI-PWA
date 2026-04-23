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
            goals,
            scheduleBlocks,
            commitments,
            habitStacks,
            todoLists,
            todos,
            userState,
        ] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).single().then(r => r.data),
            safeQuery('goals'),
            safeQuery('schedule_blocks'),
            safeQuery('commitments'),
            safeQuery('habit_stacks'),
            safeQuery('todo_lists'),
            safeQuery('todos'),
            supabase.from('user_states').select('*').eq('user_id', userId).single().then(r => r.data),
        ]);

        const exportData = {
            exported_at: new Date().toISOString(),
            user_id: userId,
            profile: profile || null,
            user_state: userState || null,
            goals,
            schedule_blocks: scheduleBlocks,
            commitments,
            habit_stacks: habitStacks,
            todo_lists: todoLists,
            todos,
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
