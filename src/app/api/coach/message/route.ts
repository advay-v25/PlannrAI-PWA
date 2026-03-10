import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildCoachContext } from '@/lib/coach/context-builder';
import { classifyIntent } from '@/lib/coach/intent-classifier';
import { generateCoachResponse } from '@/lib/coach/response-generator';

export const maxDuration = 25;

interface MessageRequest {
    message: string;
    conversation_id?: string;
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Please sign in to use Coach' },
                { status: 401 }
            );
        }

        const body: MessageRequest = await request.json();
        const { message, conversation_id } = body;

        if (!message || message.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Message is required' },
                { status: 400 }
            );
        }

        if (message.length > 1000) {
            return NextResponse.json(
                { success: false, error: 'Message too long (max 1000 characters)' },
                { status: 400 }
            );
        }

        let conversationId = conversation_id;

        if (!conversationId) {
            const { data: newConv, error: convError } = await supabase
                .from('coach_conversations')
                .insert({
                    user_id: user.id,
                    status: 'active',
                    started_at: new Date().toISOString(),
                    last_message_at: new Date().toISOString(),
                })
                .select('id')
                .single();

            if (convError) {
                console.error('Failed to create conversation:', convError);
                return NextResponse.json(
                    { success: false, error: 'Failed to start conversation' },
                    { status: 500 }
                );
            }

            conversationId = newConv.id;
        }

        await supabase.from('coach_messages').insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: 'user',
            content: message,
            created_at: new Date().toISOString(),
        });

        const { data: history } = await supabase
            .from('coach_messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(15);

        const conversationHistory = (history || []).reverse();

        const context = await buildCoachContext(user.id, supabase);
        context.last_user_message = message;

        const response = await generateCoachResponse(
            message,
            conversationHistory,
            context
        );

        await supabase.from('coach_messages').insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: 'assistant',
            content: response.summary,
            intent: response.mode === 'clarify' ? 'clarification_needed' : undefined,
            mode: response.mode,
            options: response.options || null,
            created_at: new Date().toISOString(),
        });

        await supabase
            .from('coach_conversations')
            .update({
                last_message_at: new Date().toISOString(),
                total_messages: conversationHistory.length + 2,
            })
            .eq('id', conversationId);

        const latency = Date.now() - startTime;
        console.log(`[Coach] Message processed in ${latency}ms`);

        return NextResponse.json({
            success: true,
            conversation_id: conversationId,
            response,
            meta: {
                latency_ms: latency,
            },
        });

    } catch (error) {
        console.error('[Coach] Message error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to process message. Please try again.',
        }, { status: 500 });
    }
}
