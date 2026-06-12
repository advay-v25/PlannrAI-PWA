import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { callAI } from '@/lib/ai/unified-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const { text } = body as { text?: string };
        const { userId, supabase } = context;

        if (!text || text.trim() === '') {
            return apiError("Text is required", 400);
        }

        try {
            // Rate Limit Check
            const { requireRateLimit } = await import('@/lib/rate-limit');
            const rateLimitCheck = await requireRateLimit(`brain-dump:${userId}`, 15, 300);
            if (typeof rateLimitCheck !== 'boolean') return rateLimitCheck;

            // First, locate or create the Inbox List
            let { data: inbox } = await supabase
                .from('todo_lists')
                .select('id')
                .eq('user_id', userId)
                .eq('title', 'Inbox')
                .single();

            if (!inbox) {
                const { data: newInbox, error: inboxErr } = await supabase
                    .from('todo_lists')
                    .insert({ user_id: userId, title: 'Inbox', color: 'var(--color-primary)' })
                    .select('id')
                    .single();
                if (inboxErr) throw inboxErr;
                inbox = newInbox;
            }

            // Extract tasks from brain dump chaos using callAI (with fallback)
            const response = await callAI<{ tasks: Array<{ title: string }> }>({
                model: 'fast',
                temperature: 0.1,
                systemPrompt: `You are an expert executive assistant. Extract ONLY the clear, actionable to-do items from the user's text. Ignore venting, background info, or passive statements unless they imply an action. Keep titles very concise (1-6 words). Respond ONLY with valid JSON in this format: { "tasks": [ { "title": "string" } ] }. If no tasks found, return { "tasks": [] }.`,
                prompt: text,
                requireJSON: true,
                userId: userId
            });

            if (!response.success || !response.data) {
                return apiSuccess({ inserted: 0, message: "No actionable tasks found or AI unavailable." });
            }

            const parsed = response.data;

            if (!parsed.tasks || parsed.tasks.length === 0) {
                return apiSuccess({ inserted: 0, message: "No actionable tasks found." });
            }

            // Build inserts
            const inserts = parsed.tasks.map((t: any) => ({
                user_id: userId,
                list_id: inbox.id,
                title: t.title,
                is_completed: false
            }));

            // Insert into the database
            const { data: insertedTodos, error: insertErr } = await supabase
                .from('todos')
                .insert(inserts)
                .select('*');

            if (insertErr) {
                throw new Error(insertErr.message);
            }

            return apiSuccess({
                inserted: parsed.tasks.length,
                todos: insertedTodos,
                message: `Added ${parsed.tasks.length} items to Inbox.`,
                provider: response.provider
            });

        } catch (e: any) {
            console.error("[Todos Dump API] Failed to extract from dump", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true, auditAction: 'brain_dump_extract' }
);
