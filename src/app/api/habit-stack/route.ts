import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { isPreviewEnabled } from '@/lib/featureFlags';

export const GET = secureApiRoute(
    async (context) => {
        if (!isPreviewEnabled()) return apiError('Feature disabled in production', 403);
        const { userId, supabase } = context;

        const { data, error } = await supabase
            .from('habit_stacks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) return apiError(error.message);
        return apiSuccess({ data });
    }
);

export const POST = secureApiRoute(
    async (context, body) => {
        if (!isPreviewEnabled()) return apiError('Feature disabled in production', 403);
        const { userId, supabase } = context;

        const bodyObj = (body as any) || {};
        const { data, error } = await supabase
            .from('habit_stacks')
            .insert({ ...bodyObj, user_id: userId })
            .select()
            .single();

        if (error) return apiError(error.message);
        return apiSuccess({ data });
    }
);

export const PATCH = secureApiRoute(
    async (context, body) => {
        if (!isPreviewEnabled()) return apiError('Feature disabled in production', 403);
        const { userId, supabase } = context;
        const { id, ...updates } = body as any;

        if (!id) return apiError('Missing id', 400);

        const { data, error } = await supabase
            .from('habit_stacks')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) return apiError(error.message);
        return apiSuccess({ data });
    }
);

export const DELETE = secureApiRoute(
    async (context, body) => {
        if (!isPreviewEnabled()) return apiError('Feature disabled in production', 403);
        const { userId, supabase } = context;
        // In some cases body is passed as URL params, but we'll assume it's in the body for this example
        const { id } = body as any;

        if (!id) return apiError('Missing id', 400);

        const { error } = await supabase
            .from('habit_stacks')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) return apiError(error.message);
        return apiSuccess({ deleted: true });
    }
);
