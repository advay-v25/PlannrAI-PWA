import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PatchService } from '@/lib/services/patch-service';


export const maxDuration = 60;

interface ApplyRequest {
    conversation_id: string;
    option_id: string;
    patch: any;
}

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body: ApplyRequest = await request.json();
        const { conversation_id, option_id, patch } = body;

        if (!option_id || !patch) {
            console.log(`[Coach Apply] Missing required fields. option_id: ${option_id}, patch: ${!!patch}`);
            return NextResponse.json(
                { success: false, error: 'Missing required fields (option_id, patch)' },
                { status: 400 }
            );
        }

        // Validate conversation ownership if provided (optional for auto-execution)
        if (conversation_id) {
            const { data: conversation } = await supabase
                .from('coach_conversations')
                .select('id')
                .eq('id', conversation_id)
                .eq('user_id', user.id)
                .single();

            if (!conversation) {
                return NextResponse.json(
                    { success: false, error: 'Conversation not found' },
                    { status: 404 }
                );
            }

            // Also check option expiry within this conversation
            const { data: lastMessage } = await supabase
                .from('coach_messages')
                .select('created_at, options')
                .eq('conversation_id', conversation_id)
                .eq('role', 'assistant')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (lastMessage) {
                const messageAge = Date.now() - new Date(lastMessage.created_at).getTime();
                const expiryTime = 60 * 60 * 1000; // 60 minutes

                if (messageAge > expiryTime) {
                    console.log(`[Coach Apply] Option expired. Age: ${messageAge}ms`);
                    return NextResponse.json({
                        success: false,
                        error: 'Options expired. Please ask again for fresh options.',
                        expired: true,
                    }, { status: 400 });
                }
            }
        }

        // Normalize the Coach's SchedulePatch format to CalendarPatch format for PatchService
        const normalizedPatch = normalizePatchForService(patch);

        normalizedPatch.undoable = true;

        // Resolve block IDs: if the AI gave a wrong/hallucinated UUID, try to find the
        // block by title+date so the operation can still succeed.
        await resolveBlockIds(normalizedPatch, user.id, supabase);

        console.log('[Coach Apply] Applying patch with', normalizedPatch.ops?.length || 0, 'operations');
        console.log('[Coach Apply] Ops:', JSON.stringify(normalizedPatch.ops?.map((o: any) => ({ op: o.op, event_id: o.event_id, title: o.payload?.title || o.title })), null, 2));

        const result = await PatchService.applyPatch(
            user.id,
            normalizedPatch,
            supabase,
            'coach'
        );

        // Graceful degradation: if SOME ops succeeded but others failed, still return success
        if (result.changes > 0 && result.errors.length > 0) {
            console.warn('[Coach Apply] Partial success:', result.changes, 'applied,', result.errors.length, 'failed:', result.errors);
            
            if (result.undo_token) {
                await PatchService.recordCoachAction(
                    user.id,
                    conversation_id,
                    option_id,
                    result.undo_token,
                    supabase
                );
            }

            return NextResponse.json({
                success: true,
                partial: true,
                undo_token: result.undo_token,
                applied_operations: result.changes,
                failed_operations: result.errors.length,
                errors: result.errors,
                message: `${result.changes} changes applied, ${result.errors.length} failed`,
            });
        }

        if (!result.success) {
            console.error('[Coach Apply] Patch failed:', result.errors);
            return NextResponse.json({
                success: false,
                error: result.errors?.join(', ') || 'Failed to apply patch',
                details: result.errors,
            }, { status: 409 });
        }

        if (result.undo_token) {
            await PatchService.recordCoachAction(
                user.id,
                conversation_id,
                option_id,
                result.undo_token,
                supabase
            );
        }

        console.log('[Coach Apply] Success:', result.changes, 'changes applied');

        // Clear needs_rescheduling flag since the schedule was optimized
        const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', user.id).single();
        const bioData = (profile?.bio_data as any) || {};
        if (bioData.needs_rescheduling) {
            await supabase.from('profiles').update({
                bio_data: { ...bioData, needs_rescheduling: false }
            }).eq('id', user.id);
        }

        return NextResponse.json({
            success: true,
            undo_token: result.undo_token,
            applied_operations: result.changes,
            message: 'Changes applied successfully',
        });


    } catch (error) {
        console.error('[Coach Apply] Error:', error);

        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to apply changes',
        }, { status: 500 });
    }
}

/**
 * Normalize Coach SchedulePatch format to PatchService Patch format.
 * Coach response-generator uses: { operations: [{ type: "create_block", data: {...} }] }
 * PatchService expects:          { ops: [{ op: "create_event", event: {...} }] }
 */
function normalizePatchForService(patch: any): any {
    const VALID_BLOCK_TYPES = ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'];

    function sanitizeBlockType(payload: any) {
        if (payload?.block_type && !VALID_BLOCK_TYPES.includes(payload.block_type)) {
            payload.block_type = 'flex';
        }
        return payload;
    }

    // ALWAYS prefer operations[] — it is the primary typed output from the AI.
    // ops[] (CalendarPatchOp format) is only for UI rendering and must NOT be sent to PatchService.
    // When both exist, operations[] takes precedence so we get the full typed conversion below.
    const rawOps = (patch.operations && Array.isArray(patch.operations) && patch.operations.length > 0)
        ? patch.operations
        : null;

    if (rawOps) {
        const ops = rawOps.map((operation: any) => {
            const opType = operation.type || operation.op;
            switch (opType) {
                case 'create_block':
                case 'create':
                    return {
                        op: 'create_event' as const,
                        payload: sanitizeBlockType({
                            date: operation.data?.date || operation.date,
                            start_time: operation.data?.start_time || operation.start_time,
                            end_time: operation.data?.end_time || operation.end_time,
                            title: operation.data?.title || operation.data?.context || operation.title || 'New Block',
                            block_type: VALID_BLOCK_TYPES.includes(operation.data?.block_type || operation.block_type)
                                ? (operation.data?.block_type || operation.block_type) : 'flex',
                            goal_id: operation.data?.goal_id || null,
                            pillar: operation.data?.pillar || null,
                            status: 'planned',
                            checklist: operation.data?.checklist || [],
                        }),
                    };
                case 'move_block':
                case 'move':
                    return {
                        op: 'move_event' as const,
                        event_id: operation.block_id || operation.event_id,
                        title: operation.title || operation.data?.title || operation.data?.context,
                        to_start: operation.new_start || operation.to_start,
                        to_end: operation.new_end || operation.to_end,
                        date: operation.new_date || operation.date,
                    };
                case 'update_block':
                case 'update':
                    return {
                        op: 'update_event' as const,
                        event_id: operation.block_id || operation.event_id,
                        title: operation.title || operation.data?.title,
                        fields: operation.changes || operation.fields || {},
                    };
                case 'delete_block':
                case 'delete':
                    return {
                        op: 'delete_event' as const,
                        event_id: operation.block_id || operation.event_id,
                        title: operation.title || operation.data?.title || operation.data?.context,
                    };
                case 'replan_week':
                    return {
                        op: 'replan_week' as const,
                        payload: {
                            mode: operation.mode || 'balanced',
                            allow_weekend: operation.allow_weekend !== undefined ? operation.allow_weekend : true,
                        },
                    };
                case 'update_goal':
                    return {
                        op: 'update_goal' as const,
                        goal_id: operation.goal_id,
                        fields: operation.changes || operation.fields || {},
                    };
                case 'create_goal':
                    return {
                        op: 'create_goal' as const,
                        payload: operation.data || {},
                    };
                case 'delete_goal':
                    return {
                        op: 'delete_goal' as const,
                        goal_id: operation.goal_id,
                    };
                case 'create_todo':
                    return {
                        op: 'create_todo' as const,
                        payload: operation.data || {},
                    };
                case 'update_todo':
                    return {
                        op: 'update_todo' as const,
                        todo_id: operation.todo_id,
                        fields: operation.changes || operation.fields || {},
                    };
                case 'delete_todo':
                    return {
                        op: 'delete_todo' as const,
                        todo_id: operation.todo_id,
                    };
                default:
                    console.warn('[Coach Apply] Unknown operation type:', opType);
                    return null;
            }
        }).filter(Boolean);

        return {
            ops,
            undoable: patch.undoable !== false,
            reason: patch.reason || 'Coach action',
            scope: ops.some((o: any) => o.op === 'replan_week') ? 'week' : (patch.scope || 'day'),
        };
    }

    // Fallback: ops[] already in PatchService format (no operations[] present)
    if (patch.ops && Array.isArray(patch.ops)) {
        patch.ops.forEach((op: any) => {
            if (op.payload) sanitizeBlockType(op.payload);
            if (op.event) sanitizeBlockType(op.event);
        });
        return patch;
    }

    return { ops: [], undoable: true, reason: 'Coach action', scope: 'day' };
}

/**
 * For move_event / update_event / delete_event ops, verify the event_id exists.
 * If it doesn't (AI hallucinated an ID), try to find the block by title on the
 * op's date (or within ±3 days). Mutates ops in-place.
 */
async function resolveBlockIds(patch: any, userId: string, supabase: any) {
    if (!patch.ops || !Array.isArray(patch.ops)) return;

    for (const op of patch.ops) {
        if (!['move_event', 'move', 'update_event', 'update', 'delete_event', 'delete'].includes(op.op)) continue;
        if (!op.event_id) continue;

        // Check if the ID actually exists
        const { data: existing } = await supabase
            .from('schedule_blocks')
            .select('id')
            .eq('id', op.event_id)
            .eq('user_id', userId)
            .maybeSingle();

        if (existing) continue; // ID is valid — nothing to do

        console.warn(`[Coach Apply] Block ID ${op.event_id} not found — attempting title-based resolution. title="${op.title}"`);

        if (!op.title || op.title === 'Block') {
            console.warn('[Coach Apply] No title to resolve by — skipping resolution');
            continue;
        }

        // Build a date window to search: use op.date or today ±3 days
        const baseDate = op.date ? new Date(op.date) : new Date();
        const dates: string[] = [];
        for (let d = -3; d <= 3; d++) {
            const dt = new Date(baseDate);
            dt.setDate(dt.getDate() + d);
            dates.push(dt.toISOString().split('T')[0]);
        }

        // Try exact title match first, then partial match
        const { data: candidates } = await supabase
            .from('schedule_blocks')
            .select('id, title, context, date, start_time')
            .eq('user_id', userId)
            .in('date', dates)
            .or(`title.ilike.%${op.title}%,context.ilike.%${op.title}%`);

        if (candidates && candidates.length > 0) {
            // Prefer the closest date match
            const sorted = candidates.sort((a: any, b: any) => {
                const da = Math.abs(new Date(a.date).getTime() - baseDate.getTime());
                const db = Math.abs(new Date(b.date).getTime() - baseDate.getTime());
                return da - db;
            });
            const resolved = sorted[0];
            console.log(`[Coach Apply] Resolved "${op.title}" → block ${resolved.id} on ${resolved.date} ${resolved.start_time}`);
            op.event_id = resolved.id;
        } else {
            console.warn(`[Coach Apply] Could not resolve block for title="${op.title}" in dates ${dates.join(',')}`);
        }
    }
}
