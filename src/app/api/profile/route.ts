import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateInput } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';

// GET - Get user profile
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', context.userId)
            .single();

        if (error) {
            return apiError('Failed to fetch profile', 500);
        }

        return apiSuccess({ profile });
    },
    { requireAuth: true }
);

// PUT - Update user profile
export const PUT = secureApiRoute(
    async (context, body) => {
        if (!body || typeof body !== 'object') {
            return apiError('Invalid request body');
        }

        const allowedFields = [
            'timezone',
            'sleep_start',
            'sleep_end',
            'energy_level',
            'stress_level',
            'ai_can_suggest',
            'ai_can_analyze',
            'ai_can_draft',
            'low_energy_mode',
        ];

        const updates: Record<string, unknown> = {};

        for (const field of allowedFields) {
            if (field in (body as Record<string, unknown>)) {
                const value = (body as Record<string, unknown>)[field];

                // Validate specific fields
                if (field === 'timezone' && typeof value === 'string') {
                    const validation = validateInput(value, { maxLength: 50 });
                    if (!validation.valid) continue;
                    updates[field] = validation.sanitized;
                } else if ((field === 'sleep_start' || field === 'sleep_end') && typeof value === 'string') {
                    // Validate time format HH:MM
                    if (!/^\d{2}:\d{2}$/.test(value)) continue;
                    updates[field] = value;
                } else if ((field === 'energy_level' || field === 'stress_level') && typeof value === 'number') {
                    if (value < 1 || value > 5) continue;
                    updates[field] = value;
                } else if (typeof value === 'boolean') {
                    updates[field] = value;
                }
            }
        }

        if (Object.keys(updates).length === 0) {
            return apiError('No valid updates provided');
        }

        updates.updated_at = new Date().toISOString();

        const supabase = await createClient();

        // If biological anchors changed, flag for rescheduling
        if (updates.sleep_start || updates.sleep_end || updates.timezone) {
            const { data: currentProfile } = await supabase.from('profiles').select('bio_data').eq('id', context.userId).single();
            const bioData = (currentProfile?.bio_data as any) || {};
            updates.bio_data = {
                ...bioData,
                needs_rescheduling: true,
                pending_goal_update: 'your updated sleep/wake times'
            };
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .upsert({ id: context.userId, ...updates })
            .select()
            .single();

        if (error) {
            return apiError('Failed to update profile', 500);
        }

        return apiSuccess({ profile });
    },
    { requireAuth: true, auditAction: 'profile_update' }
);
