import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;
        try {
            // Fetch all active and completed todos for the user
            const { data: todos, error } = await supabase
                .from('todos')
                .select(`
                    id, title, description, is_completed, assigned_block_id, due_date, priority, created_at, order_index
                `)
                .eq('user_id', userId)
                .order('order_index', { ascending: true })
                .order('created_at', { ascending: false });

            if (error) throw error;

            return apiSuccess(todos || []);
        } catch (e: any) {
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);

export const POST = secureApiRoute(
    async (context, body) => {
        const { 
            action, 
            todoId, 
            title, 
            isCompleted, 
            dueDate, 
            priority, 
            description, 
            orderIndex, 
            updates 
        } = body as any;
        const { userId, supabase } = context;

        try {
            if (action === 'create_todo') {
                const { data, error } = await supabase
                    .from('todos')
                    .insert({ 
                        user_id: userId, 
                        title, 
                        description: description || null,
                        is_completed: false,
                        due_date: dueDate || null,
                        priority: priority || 'medium',
                        order_index: orderIndex !== undefined ? orderIndex : 0
                    })
                    .select()
                    .single();
                if (error) throw error;

                // Cross-feature hint: If high-priority + due today → suggest blocking time
                const today = new Date().toISOString().split('T')[0];
                const isUrgentToday = (priority === 'high') && dueDate === today;

                return apiSuccess({
                    ...data,
                    calendar_suggestion: isUrgentToday,
                    calendar_suggestion_message: isUrgentToday
                        ? `High-priority task "${title}" is due today. Want to block time for it?`
                        : null,
                });
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

                // Cross-feature sync: If todo has an assigned calendar block, mark it done/planned
                if (data?.assigned_block_id) {
                    const blockStatus = isCompleted ? 'done' : 'planned';
                    await supabase
                        .from('schedule_blocks')
                        .update({ status: blockStatus })
                        .eq('id', data.assigned_block_id)
                        .eq('user_id', userId);
                    console.log(`[Todos] Auto-${blockStatus} calendar block ${data.assigned_block_id} for todo ${todoId}`);
                }

                return apiSuccess({ ...data, calendar_synced: !!data?.assigned_block_id });
            }

            if (action === 'update_todo') {
                const updatePayload: any = {};
                if (title !== undefined) updatePayload.title = title;
                if (description !== undefined) updatePayload.description = description;
                if (dueDate !== undefined) updatePayload.due_date = dueDate;
                if (priority !== undefined) updatePayload.priority = priority;
                if (isCompleted !== undefined) updatePayload.is_completed = isCompleted;

                const { data, error } = await supabase
                    .from('todos')
                    .update(updatePayload)
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

            if (action === 'reorder_todos') {
                if (!updates || !Array.isArray(updates)) return apiError("Invalid updates format", 400);

                // Supabase doesn't easily do bulk updates with distinct values in JS client without upsert.
                // We will do parallel updates for simplicity since the list shouldn't be huge.
                const promises = updates.map(u => 
                    supabase
                        .from('todos')
                        .update({ order_index: u.order_index })
                        .eq('id', u.id)
                        .eq('user_id', userId)
                );
                
                await Promise.all(promises);
                return apiSuccess({ success: true });
            }

            return apiError("Unknown action", 400);

        } catch (e: any) {
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
