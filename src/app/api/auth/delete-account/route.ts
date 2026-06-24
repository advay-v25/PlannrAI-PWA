import { createClient as createAdminClient } from '@supabase/supabase-js';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

const deleteAccountSchema = z.object({
    confirm: z.literal('delete', {
        message: 'Confirmation required. Please type "delete" to confirm.'
    })
});

export const POST = secureApiRoute(async (context, rawBody) => {
    const { user } = context;

    const parsed = deleteAccountSchema.safeParse(rawBody);

    if (!parsed.success) {
        return apiError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR');
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        return apiError('Server configuration error', 500, 'SERVER_ERROR');
    }

    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const userId = user.id;

    console.log(`[DeleteAccount] Triggering atomic cascade deletion for user: ${userId}`);

    // 3. Hard-delete the auth user first.
    // This is a single atomic database operation. Supabase Auth will delete the auth.users record,
    // which cascades to profiles, goals, schedule_blocks, commitments, weekly_reviews, and all other tables.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error('[DeleteAccount] Auth user deletion failed:', deleteError);
        return apiError('Failed to delete user account: ' + deleteError.message, 500, 'DELETION_FAILED');
    }

    console.log(`[DeleteAccount] Account and all cascaded data successfully deleted for user: ${userId}`);
    return apiSuccess({ success: true });
}, { requireAuth: true, requireCsrf: true, rateLimit: 'userStrict', auditAction: 'delete_account' });
