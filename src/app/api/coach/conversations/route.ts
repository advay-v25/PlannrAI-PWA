import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const GET = secureApiRoute(async (context) => {
    const { supabase, user } = context;

    const { data: conversations, error } = await supabase
        .from('coach_conversations')
        .select('id, primary_topic, last_message_at, created_at, status')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('[Coach Conversations] DB Error:', error);
        throw error;
    }

    return apiSuccess({
        conversations: conversations || [],
    });
}, { requireAuth: true, rateLimit: 'userStrict', auditAction: 'fetch_coach_conversations' });

export const DELETE = secureApiRoute(async (context) => {
    const { supabase, user, request } = context;
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
        return apiError('Missing conversation ID', 400, 'MISSING_ID');
    }

    // Delete the conversation
    const { error } = await supabase
        .from('coach_conversations')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) {
        console.error('[Coach Conversations] Delete Error:', error);
        throw error;
    }

    return apiSuccess({ deleted: true });
}, { requireAuth: true, requireCsrf: true, rateLimit: 'userStrict', auditAction: 'delete_coach_conversation' });
