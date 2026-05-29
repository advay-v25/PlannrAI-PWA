import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildCoachContext } from '@/lib/coach/context-builder';
import { classifyIntent } from '@/lib/coach/intent-classifier';
import { generateCoachResponse } from '@/lib/coach/response-generator';

export const maxDuration = 60;

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

        // OPTIMIZATION: Only build light context for intent classification
        const profileRes = await supabase.from('profiles').select('id, first_name, timezone').eq('id', user.id).single();
        const timezone = profileRes.data?.timezone || 'UTC';
        const now = new Date();
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const today = dateFormatter.format(now);
        const currentTime = timeFormatter.format(now);

        const [goalsRes, todayBlocksRes, energyRes, missedBlocksRes] = await Promise.all([
            supabase.from('goals').select('title').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('schedule_blocks').select('title, context, start_time, end_time, status').eq('user_id', user.id).eq('date', today),
            supabase.from('energy_checkins').select('energy_level').eq('user_id', user.id).order('checked_in_at', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'missed').gte('date', dateFormatter.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))),
        ]);

        const lightContext = {
            current_time: currentTime,
            today_blocks: todayBlocksRes.data || [],
            goals: goalsRes.data || [],
            recent_energy: energyRes.data?.energy_level,
            user_id: user.id,
            first_name: profileRes.data?.first_name || '',
            timezone,
            missed_blocks: missedBlocksRes.count || 0,
        };

        const intentClassification = await classifyIntent(
            message,
            conversationHistory,
            lightContext
        );

        const response = await generateCoachResponse(
            message,
            conversationHistory,
            lightContext as any, // We pass lightContext, and generateCoachResponse will upgrade it if needed
            supabase,
            null,
            intentClassification
        );

        await supabase.from('coach_messages').insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: 'assistant',
            content: response.summary,
            intent: response.mode === 'clarify' ? 'clarification_needed' : undefined,
            mode: response.mode === 'inform' ? 'acknowledge' : response.mode,
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
        
        let errorMessage = 'Failed to process message. Please try again.';
        let errorDetails = undefined;
        
        if (error instanceof Error) {
            errorMessage = error.message;
            errorDetails = error.stack;
            console.error('[Coach] Stack trace:', error.stack);
        } else {
            console.error('[Coach] Unknown error object:', JSON.stringify(error, null, 2));
        }

        return NextResponse.json({
            success: false,
            error: errorMessage,
            details: errorDetails
        }, { status: 500 });
    }
}
