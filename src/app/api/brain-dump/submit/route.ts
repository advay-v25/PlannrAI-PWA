import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { text, date, timezone } = body as { text: string, date?: string, timezone?: string };
        const { userId } = context;

        if (!text) return apiError("Text required", 400);

        // 1. Call AI Service Directly (Bypasses internal API 401 issues)
        const aiRes = await executeAI(userId, {
            channel: 'brain_dump',
            input: text,
            context: {
                focus_date: date,
                timezone: timezone
            }
        });

        // 2. Persist the Dump & Extraction
        if (aiRes) {
            const supabase = await createClient();

            // A. Save Raw Dump
            const { data: dump, error: dumpError } = await supabase.from('brain_dumps').insert({
                user_id: userId,
                text: text,
                content: text // Legacy support & NOT NULL constraint
            }).select('id').single();

            if (dumpError) console.error("Dump Save Error", dumpError);
            const dumpId = dump?.id;

            // B. Save Extraction (if dump saved)
            if (dumpId && aiRes.extracted) {
                await supabase.from('brain_dump_extractions').insert({
                    brain_dump_id: dumpId,
                    user_id: userId,
                    extracted_json: aiRes.extracted
                });

                // C. Save Extracted Items to Inbox (New Requirement)
                // Filter out items that are not just "notes" or "ideas" maybe? Or save everything?
                // The prompt says "Store extracted tasks as inbox_items".
                // Let's iterate tasks/commitments and save them.
                const itemsToSave = aiRes.extracted.items || [];
                if (itemsToSave.length > 0) {
                    const inboxRows = itemsToSave.map((item: any) => ({
                        user_id: userId,
                        source_dump_id: dumpId,
                        title: item.title,
                        kind: item.kind,
                        pillar: item.pillar,
                        est_min: item.est_min || 15,
                        urgency: item.urgency || 1,
                        importance: item.importance || 1,
                        due_date: item.due === 'today' ? new Date().toISOString() : (item.due === 'tomorrow' ? new Date(Date.now() + 86400000).toISOString() : item.due),
                        status: 'inbox' // default
                    }));

                    const { error: inboxError } = await supabase.from('inbox_items').insert(inboxRows);
                    if (inboxError) console.warn("Inbox Save Error", inboxError);
                }

                // D. Update User State (Signals)
                if (aiRes.extracted.signals) {
                    const signals = aiRes.extracted.signals;
                    // Upsert user_state
                    await supabase.from('user_state').upsert({
                        user_id: userId,
                        energy_level: signals.energy, // Ensure clean integer
                        emotional_state: signals,
                        last_dump_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });
                }
            }
        }

        return apiSuccess(aiRes);
    },
    { requireAuth: true }
);
