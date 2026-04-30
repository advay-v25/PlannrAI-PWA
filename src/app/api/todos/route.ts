import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;
        try {
            // Fetch all lists with their nested active and completed todos
            const { data: lists, error } = await supabase
                .from('todo_lists')
                .select(`
                    id, title, color, created_at,
                    todos (id, title, is_completed, assigned_block_id, due_date, priority, created_at)
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            return apiSuccess(lists || []);
        } catch (e: any) {
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);

export const POST = secureApiRoute(
    async (context, body) => {
        const { action, listId, todoId, title, isCompleted, dueDate, priority } = body as any;
        const { userId, supabase } = context;

        try {
            if (action === 'create_list') {
                const { data, error } = await supabase
                    .from('todo_lists')
                    .insert({ user_id: userId, title, color: 'var(--color-primary)' })
                    .select()
                    .single();
                if (error) throw error;
                return apiSuccess(data);
            }

            if (action === 'create_todo') {
                const { data, error } = await supabase
                    .from('todos')
                    .insert({ 
                        user_id: userId, 
                        list_id: listId, 
                        title, 
                        is_completed: false,
                        due_date: dueDate || null,
                        priority: priority || 'medium'
                    })
                    .select()
                    .single();
                if (error) throw error;
                return apiSuccess(data);
            }

            if (action === 'toggle_todo') {
                const { data, error } = await supabase
                    .from('todos')
                    .update({ is_completed: isCompleted })
                    .eq('id', todoId)
                    .eq('user_id', userId)
                    .select()
                    .single();
                if (error) throw error;
                return apiSuccess(data);
            }

            if (action === 'delete_todo') {
                const { error } = await supabase
                    .from('todos')
                    .delete()
                    .eq('id', todoId)
                    .eq('user_id', userId);
                if (error) throw error;
                return apiSuccess({ deleted: true });
            }

            if (action === 'delete_list') {
                const { error } = await supabase
                    .from('todo_lists')
                    .delete()
                    .eq('id', listId)
                    .eq('user_id', userId);
                if (error) throw error;
                return apiSuccess({ deleted: true });
            }

            return apiError("Unknown action", 400);

        } catch (e: any) {
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
