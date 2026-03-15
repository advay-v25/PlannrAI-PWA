import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { processBrainDump } from '@/lib/ai/brain-dump-processor';

export const maxDuration = 25;

export const POST = secureApiRoute(
    async (context, body) => {
        const { text, content, template_triggered } = body as {
            text?: string;
            content?: string;
            template_triggered?: string;
        };
        const dumpText = text || content || '';
        const { userId, supabase } = context;

        // For template triggers, text can be empty (pre-prompt is used)
        if (!dumpText && !template_triggered) {
            return apiError("Text or template required", 400);
        }

        try {
            // 1. Save raw dump (fire-and-forget)
            supabase.from('brain_dumps').insert({
                user_id: userId,
                raw_text: dumpText || `[Template: ${template_triggered}]`,
                processed: true,
                template: template_triggered || null,
            }).then(r => {
                if (r.error) console.warn('[BrainDump] Failed to save raw dump:', r.error.message);
            });

            // 2. Process via new AI-powered processor
            const result = await processBrainDump(
                userId,
                dumpText,
                supabase,
                template_triggered
            );

            // 3. Map to hook-expected format
            // The hook expects: { mode, summary, extracted: { items, constraints, signals }, options, question }
            // We bridge the new BrainDumpResponse to this shape
            const hookResponse = {
                mode: 'propose',
                summary: result.validation.acknowledgment,
                validation: result.validation,
                organized: result.organized,
                extracted: {
                    summary: result.validation.reflection,
                    items: mapOrganizedToItems(result.organized),
                    constraints: mapOrganizedToConstraints(result.organized),
                    signals: {
                        energy: undefined,
                        sentiment: undefined,
                        overwhelm: undefined,
                        motivation: undefined,
                        stress: undefined,
                    },
                },
                options: result.options.map(opt => ({
                    id: opt.id,
                    title: opt.label,
                    impact: opt.summary,
                    recommended: opt.recommended,
                    emotional_fit: opt.emotional_fit,
                    actions: opt.actions,
                    patch: normalizePatchOps(opt.patch_ops),
                    tradeoff: undefined,
                })),
                escalations: result.escalations,
                question: undefined,
            };

            return apiSuccess(hookResponse);
        } catch (e: any) {
            console.error("[BrainDump API] Process failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);

/**
 * Convert BrainDumpResponse organized sections to extracted items for the hook
 */
function mapOrganizedToItems(organized: any): Array<{
    title: string;
    kind: string;
    est_min?: number;
    urgency?: number;
    pillar?: string;
}> {
    const items: any[] = [];

    if (organized?.immediate_actions?.items) {
        for (const item of organized.immediate_actions.items) {
            items.push({ title: item, kind: 'task', urgency: 5 });
        }
    }
    if (organized?.ideas_to_save?.items) {
        for (const item of organized.ideas_to_save.items) {
            items.push({ title: item, kind: 'idea' });
        }
    }
    if (organized?.emotional_notes?.items) {
        for (const item of organized.emotional_notes.items) {
            items.push({ title: item, kind: 'worry' });
        }
    }
    if (organized?.schedule_adjustments?.items) {
        for (const item of organized.schedule_adjustments.items) {
            items.push({ title: item, kind: 'constraint' });
        }
    }

    return items;
}

/**
 * Convert organized schedule_adjustments to constraints
 */
function mapOrganizedToConstraints(organized: any): Array<{
    type: string;
    description: string;
}> {
    if (!organized?.schedule_adjustments?.items) return [];
    return organized.schedule_adjustments.items.map((item: string) => ({
        type: 'time_block',
        description: item,
    }));
}

/**
 * Convert brain dump patch_ops to PatchService-compatible patch format
 */
function normalizePatchOps(patchOps: any[]): { ops: any[] } {
    if (!patchOps || patchOps.length === 0) {
        return { ops: [] };
    }

    const ops = patchOps.map((po: any) => {
        const opType = po.op;
        const block = po.block || {};

        switch (opType) {
            case 'add':
            case 'create':
            case 'create_event':
                return {
                    op: 'create_event',
                    payload: {
                        date: block.date,
                        start_time: block.start_time,
                        end_time: block.end_time,
                        title: block.title || 'New Block',
                        block_type: block.type || block.block_type || 'flex',
                        goal_id: block.goal_id || null,
                        pillar: block.pillar || null,
                        status: block.status || 'planned',
                    },
                };
            case 'update':
            case 'update_event':
                return {
                    op: 'update_event',
                    event_id: block.id,
                    fields: {
                        ...(block.start_time ? { start_time: block.start_time } : {}),
                        ...(block.end_time ? { end_time: block.end_time } : {}),
                        ...(block.title ? { title: block.title } : {}),
                        ...(block.date ? { date: block.date } : {}),
                        ...(block.status ? { status: block.status } : {}),
                    },
                };
            case 'delete':
            case 'delete_event':
                return {
                    op: 'delete_event',
                    event_id: block.id,
                };
            default:
                console.warn('[BrainDump Submit] Unknown op type:', opType);
                return po;
        }
    });

    return { ops, undoable: true, reason: 'Brain dump action', scope: 'day' } as any;
}
