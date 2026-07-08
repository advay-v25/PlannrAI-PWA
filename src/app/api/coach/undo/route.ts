import { NextResponse } from 'next/server';
import { secureApiRoute } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body: any) => {
        try {
            const { user, supabase } = context;
            const { undo_token } = body;

            if (!undo_token) {
                return NextResponse.json(
                    { success: false, error: 'undo_token is required' },
                    { status: 400 }
                );
            }

            const result = await PatchService.undoPatch(user.id, undo_token, supabase);

            if (!result.success) {
                return NextResponse.json({
                    success: false,
                    error: 'Undo failed',
                }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                message: 'Changes undone successfully',
            });
        } catch (error) {
            console.error('[Coach Undo] Error:', error);

            return NextResponse.json({
                success: false,
                error: 'Failed to undo changes',
            }, { status: 500 });
        }
    },
    { requireAuth: true, requireCsrf: true, rateLimit: 'aiCoach' }
);
