import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AgentOrchestrator } from '@/lib/agents/orchestrator';
import { ContextBuilder } from '@/lib/agents/context-builder';
import { CalendarPatch } from '@/lib/agents/core/types';

export const maxDuration = 60; // Allow 60s for AI processing

export async function POST(request: NextRequest) {
    try {
        // 1. Authenticate
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { message, source, date } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // 2. Build Context (Server-Side)
        const context = await ContextBuilder.build(user.id);

        // 3. Run Agent Pipeline (Orchestrator)
        const orchestrator = new AgentOrchestrator();
        const result = await orchestrator.run(user.id, message, context.currentSchedule);

        // 4. Store Options in DB
        const storedOptions = [];

        for (const option of result.scheduler.options) {
            const { error } = await supabase
                .from('agent_options')
                .insert({
                    user_id: user.id,
                    label: option.label,
                    patch: option.patch as any, // Cast to avoid TS strictness on JSONB
                    context_snapshot: {}, // Optional: snapshot for safety
                })
                .select('id')
                .single();

            if (!error) {
                // We need to query the ID back (Supabase returns it if select() is used)
                // But wait, insert().select() returns an array.
                // Let's optimize.
            }
        }

        // Optimized Insert & Select
        const { data: insertedOptions, error: insertError } = await supabase
            .from('agent_options')
            .insert(
                result.scheduler.options.map(opt => ({
                    user_id: user.id,
                    label: opt.label,
                    patch: opt.patch as unknown as object, // JSONB compatible
                }))
            )
            .select('id, label');

        if (insertError) {
            console.error("Failed to store options", insertError);
            return NextResponse.json({ error: 'Database persistence failed' }, { status: 500 });
        }

        // 5. Save to Memory (Long-term Context)
        try {
            const { MemoryService } = await import('@/lib/services/memory-service');
            const convo = await MemoryService.createConversation(user.id, 'coach'); // Get/Create latest

            if (convo) {
                // Save User Message
                await MemoryService.addMessage(user.id, convo.id, 'user', message);

                // Save Assistant Response
                await MemoryService.addMessage(user.id, convo.id, 'assistant', result.summary, {
                    options_generated: insertedOptions.length,
                    planner_intent: result.planner.intent
                });
            }
        } catch (memError) {
            console.error("Failed to save memory", memError);
            // Non-blocking error
        }

        // 6. Return Frontend-Safe Response
        return NextResponse.json({
            message: result.summary || "Options generated.",
            planner_summary: `Detected intent: ${result.planner.intent}`,
            options: insertedOptions.map(opt => ({
                id: opt.id,
                label: opt.label
            })),
            is_impossible: result.scheduler.impossible
        });

    } catch (error) {
        console.error('Intent API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
