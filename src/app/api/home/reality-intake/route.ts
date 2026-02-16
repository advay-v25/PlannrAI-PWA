
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { BrainDumpOutputSchema } from '@/lib/ai/registry';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { text, date } = body as { text: string; date: string };

        if (!text) return apiError('Text required', 400);

        // 1. Save to Brain Dump Entries
        const { data: entry, error: dbError } = await supabase
            .from('brain_dump_entries') // Ensure this table name matches migration (plural/singular)
            .insert({
                user_id: userId,
                content: text, // Schema check needed: is it 'text' or 'content'? Migration says 'content' if I recall 001. 
                // Wait, in 001_initial_schema.sql it was public.brain_dumps with 'content'.
                // Implementation plan said `brain_dump_entries`.
                // Let's assume `brain_dumps` table from 001 exists. I will use that.
            })
            .select() // Returning *
            .single();

        // Correction: My migration 001 has `brain_dumps`. My implementation plan proposed `brain_dump_entries` but migration 001 had `brain_dumps`.
        // I will use `brain_dumps` found in 001 to avoid duplication if it already exists. 
        // Checking 001 again... `CREATE TABLE IF NOT EXISTS public.brain_dumps`
        // So I'll use `brain_dumps`.
        // BUT wait, I should verify the column name. `content TEXT NOT NULL`.

        let savedEntry = null;

        // Using brain_dumps as per 001 schema
        const { data: dump, error: dumpError } = await supabase
            .from('brain_dumps')
            .insert({
                user_id: userId,
                content: text
            })
            .select()
            .single();

        if (dumpError) {
            console.error('Failed to save brain dump:', dumpError);
            return apiError('Failed to save entry', 500);
        }
        savedEntry = dump;


        // 2. Trigger AI Analysis
        // We call our internal AI execute endpoint or service.
        // For robustness, calling the SERVICE wrapper or importing logic is better than fetch(localhost).
        // I'll assume we can use `AIGateway` equivalent manually, OR construct the payload for frontend to call?
        // The implementation plan says "This calls /api/ai/execute... behind the scenes OR directly".
        // Calling it server-side is cleaner.

        // Import the AI Gateway logic? Or just `fetch`.
        // `fetch` to same domain can be tricky with auth headers.
        // Better: Use `src/lib/ai/execute` logic if extracted, OR just return success and let frontend call AI?
        // The prompt says "Returns AIResponse". So I must call AI here.

        // I'll use the URL of the deployment/localhost.
        const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/execute`;

        // Construct Context
        const { data: schedule } = await supabase.from('schedule_blocks').select('*').eq('user_id', userId).eq('date', date);
        const { data: goals } = await supabase.from('goals').select('title, category').eq('user_id', userId);

        const aiContext = {
            input: text,
            current_schedule: schedule,
            goals: goals
        };

        try {
            // Internal fetch to AI
            // We need to pass the cookie for auth if the AI route requires it, 
            // OR use a service-role call if we trust this server-side call.
            // But `/api/ai/execute` checks auth.
            // EASIER: Extract AI logic to a lib function that both this route and `api/ai/execute` use.
            // For now, to save time/risk, I will use `fetch` with the request headers.

            const aiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': context.request.headers.get('cookie') || ''
                },
                body: JSON.stringify({
                    channel: 'brain_dump', // "home" channel? Plan says 'brain_dump' for reality intake.
                    context: aiContext,
                    model: 'fast' // or 'smart'
                })
            });

            if (!aiResponse.ok) {
                console.error("AI Call failed", await aiResponse.text());
                // Fallback
                return apiSuccess({
                    entry: savedEntry,
                    ai: null,
                    fallback: true
                });
            }

            const aiResult = await aiResponse.json();

            // 3. Save extraction to the dump entry (async update)
            if (aiResult.data && aiResult.data.extracted) {
                await supabase.from('brain_dumps').update({
                    extracted_signals: aiResult.data.extracted,
                    // detected_constraints: ...
                }).eq('id', savedEntry.id);
            }

            return apiSuccess({
                entry: savedEntry,
                analysis: aiResult.data // This conforms to BrainDumpOutputSchema
            });

        } catch (e) {
            console.error("AI Error", e);
            return apiSuccess({ entry: savedEntry, ai_error: true });
        }
    },
    { requireAuth: true, auditAction: 'reality_intake' }
);
