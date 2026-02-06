
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

// POST - Create a new anchor (commitment)
export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['title', 'start_time', 'end_time', 'days_of_week']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { title, start_time, end_time, days_of_week } = body as {
            title: string;
            start_time: string;
            end_time: string;
            days_of_week: number[];
        };

        // Validate time format
        if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
            return apiError('Invalid time format. Use HH:MM');
        }

        // Validate logic
        if (end_time <= start_time) {
            return apiError('End time must be after start time');
        }

        const supabase = await createClient();

        // Check if user is authenticated (handled by secureApiRoute but good to be explicit with Context)
        if (!context.userId) {
            return apiError('Unauthorized', 401);
        }

        console.log(`[API] Creating Anchor for user ${context.userId}:`, title);

        const { data: commitment, error } = await supabase
            .from('commitments')
            .insert({
                user_id: context.userId,
                title,
                start_time,
                end_time,
                days_of_week,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('[API] Anchor Creation Failed:', error);
            return apiError('Failed to create anchor', 500, error);
        }

        return apiSuccess({ commitment }, 201);
    },
    { requireAuth: true, auditAction: 'anchor_create' }
);
