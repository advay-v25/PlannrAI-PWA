import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

export const GET = secureApiRoute(async (context) => {
    const { supabase, user, request } = context;

    const searchParams = request.nextUrl.searchParams;
    let requestedId = searchParams.get('id');

    if (requestedId) {
        const parsed = z.string().uuid().safeParse(requestedId);
        if (!parsed.success) {
            return apiError('Invalid conversation ID format', 400, 'VALIDATION_ERROR');
        }
        requestedId = parsed.data;
    }

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
            return apiSuccess({
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
             return apiError('Conversation not found', 404, 'NOT_FOUND');
        }
    }

    const { data: messages } = await supabase
        .from('coach_messages')
        .select('id, role, content, mode, options, selected_option_id, patch_version_id, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(50); // increased limit to load full history

    let finalMessages = messages || [];

    if (finalMessages.length > 0) {
        const lastMsg = finalMessages[finalMessages.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.options && Array.isArray(lastMsg.options) && lastMsg.options.length > 0 && !lastMsg.selected_option_id) {
            // The chat was abandoned with unselected options.
            const { data: newMsg } = await supabase
                .from('coach_messages')
                .insert({
                    conversation_id: conversationId,
                    user_id: user.id,
                    role: 'assistant',
                    content: 'No changes applied',
                    mode: null,
                    options: null
                })
                .select('id, role, content, mode, options, selected_option_id, patch_version_id, created_at')
                .single();

            if (newMsg) {
                finalMessages.push(newMsg);
            }
        }
    }

    return apiSuccess({
        conversation_id: conversationId,
        messages: finalMessages,
    });
}, { requireAuth: true, rateLimit: 'userStrict', auditAction: 'fetch_coach_history' });
