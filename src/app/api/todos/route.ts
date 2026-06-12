import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';
import { validateWithZod } from '@/lib/security/zod-validator';

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

// --- Zod schemas for all actions ---
const CreateTodoSchema = z.object({
    action: z.literal('create_todo'),
    title: z.string().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
    description: z.string().max(2000, 'Description cannot exceed 2000 characters').nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    orderIndex: z.number().int().optional().default(0),
});

const ToggleTodoSchema = z.object({
    action: z.literal('toggle_todo'),
    todoId: z.string().uuid('Invalid Todo ID'),
    isCompleted: z.boolean(),
});

const UpdateTodoSchema = z.object({
    action: z.literal('update_todo'),
    todoId: z.string().uuid('Invalid Todo ID'),
    title: z.string().min(1, 'Title is required').max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    isCompleted: z.boolean().optional(),
});

const DeleteTodoSchema = z.object({
    action: z.literal('delete_todo'),
    todoId: z.string().uuid('Invalid Todo ID'),
});

const ReorderTodosSchema = z.object({
    action: z.literal('reorder_todos'),
    updates: z.array(z.object({
        id: z.string().uuid('Invalid Todo ID'),
        order_index: z.number().int()
    })).min(1, 'Updates list cannot be empty')
});

const TodoRequestSchema = z.discriminatedUnion('action', [
    CreateTodoSchema,
    ToggleTodoSchema,
    UpdateTodoSchema,
    DeleteTodoSchema,
    ReorderTodosSchema
]);

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        // Validate request action & payload
        const validation = validateWithZod(TodoRequestSchema, body);
        if (!validation.valid) {
            return apiError(validation.errors, 400);
        }

        const payload = validation.data;

        try {
            if (payload.action === 'create_todo') {
                const { title, description, dueDate, priority, orderIndex } = payload;
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

            if (payload.action === 'toggle_todo') {
                const { todoId, isCompleted } = payload;
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

            if (payload.action === 'update_todo') {
                const { todoId, title, description, dueDate, priority, isCompleted } = payload;
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

            if (payload.action === 'delete_todo') {
                const { todoId } = payload;
                const { error } = await supabase
                    .from('todos')
                    .delete()
                    .eq('id', todoId)
                    .eq('user_id', userId);
                if (error) throw error;
                return apiSuccess({ deleted: true });
            }

            if (payload.action === 'reorder_todos') {
                const { updates } = payload;

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
