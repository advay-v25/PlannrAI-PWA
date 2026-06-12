import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { optimizeDayAI } from '@/lib/calendar/ai/optimize-day';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export const POST = secureApiRoute(
    async (context, body) => {
        try {
            const { userId, supabase } = context;
            const { focus, date } = (body || {}) as { focus?: string; date?: string };
            const targetDate = date || new Date().toISOString().split('T')[0];

            // 1. Build context
            const calendarCtx = await buildCalendarContext(userId, supabase);

            // 2. Run optimization
            const result = await optimizeDayAI(calendarCtx, focus);

            // 3. Convert options to frontend format (add patch wrapper)
            // CRITICAL: inject target date into all create_event payloads
            const options = result.options.map(opt => ({
                id: opt.id,
                label: opt.label,
                description: opt.description,
                tradeoff: opt.tradeoff,
                patch: {
                    ops: opt.ops.map(op => {
                        if (op.op === 'create_event' && op.payload) {
                            return { ...op, payload: { ...op.payload, date: targetDate } };
                        }
                        return op;
                    }),
                    undoable: true,
                    reason: `Optimize Day: ${opt.label}`,
                },
            }));

            return apiSuccess({
                analysis: result.analysis,
                options,
                warnings: [],
            });

        } catch (e: any) {
            console.error('[OptimizeDay] Error:', e);
            return apiError(`Optimization failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true, rateLimit: 'aiPlanDay' }
);
