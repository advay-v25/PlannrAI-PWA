import { NextResponse } from 'next/server';
import { secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';

export const POST = secureApiRoute(
    async (context: SecureApiContext, body: any) => {
        try {
            const { user, supabase } = context;
            const { suggestion_id } = body;

            if (!suggestion_id) {
                return NextResponse.json(
                    { success: false, error: 'suggestion_id is required' },
                    { status: 400 }
                );
            }

            await supabase
                .from('coach_proactive_log')
                .update({ dismissed_at: new Date().toISOString() })
                .eq('id', suggestion_id)
                .eq('user_id', user.id);

            // Also clear needs_rescheduling flag if this was a scheduling suggestion
            if (suggestion_id === 'settings-sync-needed') {
                const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', user.id).single();
                const bioData = (profile?.bio_data as any) || {};
                if (bioData.needs_rescheduling) {
                    await supabase.from('profiles').update({
                        bio_data: { ...bioData, needs_rescheduling: false }
                    }).eq('id', user.id);
                }
            }

            return NextResponse.json({
                success: true,
                message: 'Suggestion dismissed',
            });

        } catch (error) {
            console.error('[Coach Dismiss] Error:', error);

            return NextResponse.json({
                success: false,
                error: 'Failed to dismiss suggestion',
            }, { status: 500 });
        }
    },
    { requireAuth: true, auditAction: 'coach_dismiss' }
);
