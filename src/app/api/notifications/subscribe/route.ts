import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

/**
 * Web Push subscription registry.
 *
 * POST   — upsert the browser's PushSubscription so the send-notifications Edge
 *          Function can reach this device while the app is closed.
 * DELETE — drop a single endpoint (user turned notifications off on this device).
 *
 * Dead endpoints are also pruned server-side: the Edge Function deletes any row
 * whose push service replies 404/410.
 */

const SubscribeSchema = z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
        p256dh: z.string().min(1).max(512),
        auth: z.string().min(1).max(512),
    }),
});

const UnsubscribeSchema = z.object({
    endpoint: z.string().url().max(2000),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase, request } = context;

        const parsed = SubscribeSchema.safeParse(body);
        if (!parsed.success) {
            return apiError('Invalid push subscription', 400);
        }
        const { endpoint, keys } = parsed.data;

        // Upsert on endpoint: re-subscribing the same device must not create a
        // duplicate, and an endpoint that moved to another account (shared
        // device) has to follow the account that owns it now.
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert(
                {
                    user_id: userId,
                    endpoint,
                    p256dh: keys.p256dh,
                    auth: keys.auth,
                    user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
                },
                { onConflict: 'endpoint' }
            );

        if (error) {
            return apiError(error.message, 500);
        }

        return apiSuccess({ subscribed: true });
    },
    { requireAuth: true, auditAction: 'push_subscribe' }
);

export const DELETE = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        const parsed = UnsubscribeSchema.safeParse(body);
        if (!parsed.success) {
            return apiError('Invalid endpoint', 400);
        }

        const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('endpoint', parsed.data.endpoint);

        if (error) {
            return apiError(error.message, 500);
        }

        return apiSuccess({ unsubscribed: true });
    },
    { requireAuth: true, auditAction: 'push_unsubscribe' }
);
