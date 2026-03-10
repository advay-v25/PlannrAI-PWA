import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { executePatch } from '@/lib/coach/patch-executor';

export const maxDuration = 15;

interface ApplyRequest {
    conversation_id: string;
    option_id: string;
    patch: any;
}

export async function POST(request: NextRequest) {
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

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body: ApplyRequest = await request.json();
        const { conversation_id, option_id, patch } = body;

        if (!conversation_id || !option_id || !patch) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const { data: conversation } = await supabase
            .from('coach_conversations')
            .select('id')
            .eq('id', conversation_id)
            .eq('user_id', user.id)
            .single();

        if (!conversation) {
            return NextResponse.json(
                { success: false, error: 'Conversation not found' },
                { status: 404 }
            );
        }

        const { data: lastMessage } = await supabase
            .from('coach_messages')
            .select('created_at, options')
            .eq('conversation_id', conversation_id)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (lastMessage) {
            const messageAge = Date.now() - new Date(lastMessage.created_at).getTime();
            const tenMinutes = 10 * 60 * 1000;

            if (messageAge > tenMinutes) {
                return NextResponse.json({
                    success: false,
                    error: 'Options expired. Please ask again for fresh options.',
                    expired: true,
                }, { status: 400 });
            }
        }

        const result = await executePatch(
            user.id,
            patch,
            option_id,
            conversation_id
        );

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error,
                conflict: result.conflict,
                updated_options: result.updated_options,
            }, { status: 409 });
        }

        await supabase
            .from('coach_conversations')
            .update({
                actions_taken: supabase.rpc('increment', { x: 1 }),
            })
            .eq('id', conversation_id);

        return NextResponse.json({
            success: true,
            version_id: result.version_id,
            applied_operations: result.applied_operations,
            message: 'Changes applied successfully',
        });

    } catch (error) {
        console.error('[Coach Apply] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to apply changes',
        }, { status: 500 });
    }
}
