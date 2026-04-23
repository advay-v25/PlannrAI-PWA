import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { groqChat } from '@/lib/ai/groq-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const { text } = body as { text?: string };
        const { userId, supabase } = context;

        if (!text || text.trim() === '') {
            return apiError("Text is required", 400);
        }

        try {
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

            // Extract tasks from brain dump chaos using groqChat
            const result = await groqChat({
                model: 'llama-3.1-8b-instant',
                temperature: 0.1,
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert executive assistant. Extract ONLY the clear, actionable to-do items from the user's text. Ignore venting, background info, or passive statements unless they imply an action. Keep titles very concise (1-6 words). Respond ONLY with valid JSON in this format: { "tasks": [ { "title": "string" } ] }. If no tasks found, return { "tasks": [] }.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                userId,
            });

            let parsed;
            try {
                parsed = JSON.parse(result);
            } catch {
                return apiSuccess({ inserted: 0, message: "No actionable tasks found." });
            }

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
                message: `Added ${parsed.tasks.length} items to Inbox.`
            });

        } catch (e: any) {
            console.error("[Todos Dump API] Failed to extract from dump", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
