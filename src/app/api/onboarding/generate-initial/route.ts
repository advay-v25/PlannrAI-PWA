import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';

export const POST = secureApiRoute(
    async (context, body) => {
        const { selected_variant_id } = body as any;
        const supabase = context.supabase;
        const effectiveUserId = context.userId;

        const { buildCalendarContext } = await import('@/lib/calendar/context-builder');
        const { generateWeekPlan } = await import('@/lib/calendar/ai/plan-week');
        const { PatchService } = await import('@/lib/services/patch-service');
        
        const today = new Date().toISOString().split('T')[0];
        let blocksCreated = 0;

        try {
            const calendarCtx = await buildCalendarContext(effectiveUserId, supabase as any);
            
            // Map selected variant to generation mode
            const modeMap: Record<string, 'balanced' | 'momentum' | 'recovery'> = {
                balanced: 'balanced',
                intense: 'momentum',
                recovery: 'recovery',
            };
            const genMode = modeMap[selected_variant_id || 'balanced'] || 'balanced';
            
            const variants = await generateWeekPlan(calendarCtx, today, genMode, true);

            if (variants.length > 0) {
                const bestVariant = variants[0]; // Take standard balanced variant
                
                const calendarPatch = {
                    ops: bestVariant.blocks.map((b: any) => ({
                        op: 'create_event' as const,
                        payload: {
                            date: b.date,
                            start_time: b.start_time,
                            end_time: b.end_time,
                            title: b.title,
                            block_type: b.block_type,
                            goal_id: b.goal_id || null,
                            pillar: b.pillar || null,
                            status: 'planned',
                            checklist: b.checklist || null,
                        }
                    })),
                    scope: 'week' as const,
                    reason: 'Onboarding initial schedule generation',
                };

                // Use 'coach' source to bypass standard user constraints during initial setup
                const patchResult = await PatchService.applyPatch(effectiveUserId, calendarPatch as any, supabase as any, 'coach');
                if (!patchResult.success) {
                    console.error('Initial schedule patch failed:', patchResult.errors);
                    throw new Error(`Schedule generation failed: ${patchResult.errors.join(', ')}`);
                }
                blocksCreated = bestVariant.blocks.length;
            } else {
                throw new Error('Failed to generate any schedule variants. Please check your constraints.');
            }
        } catch (genError: any) {
            console.error('Initial schedule generation failed:', genError);
            throw new Error(`AI Calendar Planning Error: ${genError.message}`);
        }

        return apiSuccess({
            success: true,
            message: 'Initial schedule generated successfully',
            blocksCreated
        });
    },
    { requireAuth: process.env.NODE_ENV !== 'development', auditAction: 'onboarding_generate_initial' }
);
