import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@supabase/supabase-js';
import { SchedulingProtocol, type MoodLevel } from '@/lib/scheduling/protocol';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { energy_level, emotional_state } = body as { energy_level: number; emotional_state: string };

        if (energy_level == null || !emotional_state) {
            return apiError('energy_level and emotional_state required', 400);
        }

        const adminDb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: existing } = await adminDb
            .from('user_states')
            .select('id')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let error;
        if (existing?.id) {
            const { error: updateErr } = await adminDb
                .from('user_states')
                .update({
                    energy_level: Math.min(5, Math.max(1, energy_level)),
                    emotional_state,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
            error = updateErr;
        } else {
            const { error: insertErr } = await adminDb
                .from('user_states')
                .insert({
                    user_id: userId,
                    energy_level: Math.min(5, Math.max(1, energy_level)),
                    emotional_state,
                    updated_at: new Date().toISOString()
                });
            error = insertErr;
        }

        if (error) {
            console.error('Energy checkin error:', error);
            return apiError('Failed to save check-in', 500);
        }

        // SCHEDULING PROTOCOL: Compute mode and return actionable banner
        const clampedEnergy = Math.min(5, Math.max(1, energy_level));
        const mood = emotional_state as MoodLevel;
        const scheduleMode = SchedulingProtocol.computeMode({ energy: clampedEnergy, mood });
        const bannerResponse = SchedulingProtocol.getBannerResponse(scheduleMode);

        console.log(`[EnergyCheckin] User ${userId}: energy=${clampedEnergy}, mood=${mood} → ${scheduleMode.strategy}`);

        return apiSuccess({
            saved: true,
            ...bannerResponse,
        });
    },
    { requireAuth: true, auditAction: 'energy_checkin' }
);
