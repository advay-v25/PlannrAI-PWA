import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { energy_level, emotional_state } = body as { energy_level: number; emotional_state: string };

        if (!energy_level || !emotional_state) {
            return apiError('energy_level and emotional_state required', 400);
        }

        const { error } = await supabase
            .from('user_states')
            .upsert({
                user_id: userId,
                energy_level: Math.min(5, Math.max(1, energy_level)),
                emotional_state,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) {
            console.error('Energy checkin error:', error);
            return apiError('Failed to save check-in', 500);
        }

        return apiSuccess({ saved: true });
    },
    { requireAuth: true, auditAction: 'energy_checkin' }
);
