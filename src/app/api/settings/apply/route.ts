
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { apiClient } from '@/lib/api-client';

export const POST = secureApiRoute(
    async (context, body) => {
        if (!body || typeof body !== 'object' || !('patch' in body) || !body.patch || !Array.isArray((body as any).patch.ops)) {
            return apiError('Invalid request body. "patch.ops" is required.', 400);
        }
        const { patch } = body as { patch: any };
        const { userId } = context;

        // 1. Separate settings ops from schedule ops
        // Our 'preview' endpoint generated a patch with 'update_settings' ops.
        // We need to execute those first, then delegte schedule ops to the patch engine.

        const settingsOps = patch.ops.filter((op: any) => op.op === 'update_settings');
        const otherOps = patch.ops.filter((op: any) => op.op !== 'update_settings' && op.op !== 'analyze_content');

        const supabase = await createClient();

        // 2. Apply Settings Updates
        for (const op of settingsOps) {
            const { error } = await supabase
                .from('profile_preferences')
                .update(op.fields)
                .eq('user_id', userId);

            if (error) {
                console.error("Failed setting apply", error);
                return apiError("Failed to apply settings", 500);
            }
        }

        // 3. Apply Schedule Updates (if any)
        // If there are other ops (like regenerate week), we'd typically call the patch engine.
        // However, if the preview just returned "analyze_content", it means we need to trigger a full regeneration.
        // For this MVP, if the patch implied a regeneration, we might just return success and let the UI refresh/re-fetch.
        // But if 'otherOps' has actual block moves, we call the patch API.

        if (otherOps.length > 0) {
            // Re-construct a patch for the schedule API and call it directly via fetch
            // bypassing apiClient to ensure correct base URL on the server
            const origin = context.request.nextUrl.origin;
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            const authHeader = context.request.headers.get('authorization');
            const cookieHeader = context.request.headers.get('cookie');
            if (authHeader) headers['Authorization'] = authHeader;
            if (cookieHeader) headers['Cookie'] = cookieHeader;

            await fetch(`${origin}/api/calendar/apply-schedule`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ action: 'manual', patch: { update: otherOps } })
            });
        }

        return apiSuccess({ success: true });
    },
    { requireAuth: true }
);
