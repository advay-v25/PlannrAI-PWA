import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
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

        const searchParams = request.nextUrl.searchParams;
        const requestedId = searchParams.get('id');

        let conversationId = requestedId;

        if (!conversationId) {
            const { data: conversation } = await supabase
                .from('coach_conversations')
                .select('id')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .order('last_message_at', { ascending: false })
                .limit(1)
                .single();

            if (!conversation) {
                return NextResponse.json({
                    success: true,
                    conversation_id: null,
                    messages: [],
                });
            }
            conversationId = conversation.id;
        } else {
            // Verify ownership if requestedId is provided
            const { data: conversation } = await supabase
                .from('coach_conversations')
                .select('id')
                .eq('id', conversationId)
                .eq('user_id', user.id)
                .single();
            if (!conversation) {
                 return NextResponse.json({
                    success: false,
                    error: 'Conversation not found',
                }, { status: 404 });
            }
        }

        const { data: messages } = await supabase
            .from('coach_messages')
            .select('id, role, content, mode, options, selected_option_id, patch_version_id, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(50); // increased limit to load full history

        return NextResponse.json({
            success: true,
            conversation_id: conversationId,
            messages: messages || [],
        });

    } catch (error) {
        console.error('[Coach History] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to fetch history',
        }, { status: 500 });
    }
}
