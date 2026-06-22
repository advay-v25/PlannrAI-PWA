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
        if (!user) return new NextResponse("Unauthorized", { status: 401 });

        const { checkMultipleRateLimits, getClientIP, createRateLimitHeaders } = await import('@/lib/security/rate-limiter');
        const ip = getClientIP(request);
        const rateLimitResult = await checkMultipleRateLimits(ip, user.id, request.nextUrl.pathname, 'aiCoach');
        if (!rateLimitResult.allowed) {
            const retryAfter = rateLimitResult.retryAfter || 0;
            let errorMsg = 'Too many requests. Please slow down.';
            if (retryAfter > 0) {
                const days = Math.floor(retryAfter / (24 * 3600));
                const hours = Math.floor((retryAfter % (24 * 3600)) / 3600);
                const mins = Math.floor((retryAfter % 3600) / 60);
                const timeStr = [];
                if (days > 0) timeStr.push(`${days}d`);
                if (hours > 0) timeStr.push(`${hours}h`);
                if (mins > 0 || timeStr.length === 0) timeStr.push(`${mins}m`);
                errorMsg = `Daily Coach limit reached. Refreshes in ${timeStr.join(' ')}.`;
            }
            const headers = createRateLimitHeaders(rateLimitResult);
            return new NextResponse(
                JSON.stringify({ error: { message: errorMsg }, retryAfter, resetAt: rateLimitResult.resetAt.toISOString() }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        ...Object.fromEntries(headers.entries()),
                    },
                }
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

        // Validate conversation ownership if provided (advisory — non-blocking)
        // If the conversation_id doesn't exist (e.g. transient sidebar session), we still
        // allow the patch to proceed so the action is never silently swallowed.
        let conversationVerified = false;
        if (conversation_id) {
            const { data: conversation } = await supabase
                .from('coach_conversations')
                .select('id')
                .eq('id', conversation_id)
                .eq('user_id', user.id)
                .single();

            if (!conversation) {
                // Warn but continue — don't hard-reject on missing conversation
                console.warn(`[Coach Apply] Conversation ${conversation_id} not found for user ${user.id} — proceeding without conversation-level validation.`);
            } else {
                conversationVerified = true;

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
        }

        // Normalize the Coach's SchedulePatch format to CalendarPatch format for PatchService
        const normalizedPatch = normalizePatchForService(patch);

        normalizedPatch.undoable = true;

        // Resolve block IDs: if the AI gave a wrong/hallucinated UUID, try to find the
        // block by title+date so the operation can still succeed.
        await resolveBlockIds(normalizedPatch, user.id, supabase);

        // ── SERVER-SIDE VALIDATION ─────────────────────────────────────────
        // Hard safety net: reject operations that violate immutable rules,
        // even if the AI prompt failed to prevent them.
        const validationErrors = await validateCoachOps(normalizedPatch, user.id, supabase);
        if (validationErrors.length > 0) {
            console.warn('[Coach Apply] Validation rejected ops:', validationErrors);
            return NextResponse.json({
                success: false,
                error: validationErrors.join('; '),
                validation_failures: validationErrors,
            }, { status: 422 });
        }

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
            
            if (result.undo_token && conversationVerified) {
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

        if (result.undo_token && conversationVerified) {
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
                            is_locked: operation.data?.is_locked || false,
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
                case 'replan_day':
                    return {
                        op: 'replan_day' as const,
                        payload: {
                            mode: operation.mode || 'balanced',
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
                case 'create_habit_stack':
                    return {
                        op: 'create_habit_stack' as const,
                        payload: operation.data || {},
                    };
                case 'update_habit_stack':
                    return {
                        op: 'update_habit_stack' as const,
                        stack_id: operation.stack_id,
                        fields: operation.changes || operation.fields || {},
                    };
                case 'delete_habit_stack':
                    return {
                        op: 'delete_habit_stack' as const,
                        stack_id: operation.stack_id,
                    };
                case 'update_settings':
                    return {
                        op: 'update_settings' as const,
                        payload: operation.data || {},
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

    // First pass: Resolve move_event (missed block)
    const moveOp = patch.ops.find((o: any) => o.op === 'move_event' || o.op === 'move' || o.op === 'update_event' || o.op === 'update');
    if (moveOp && moveOp.event_id) {
        const { data: existing } = await supabase.from('schedule_blocks').select('id').eq('id', moveOp.event_id).eq('user_id', userId).maybeSingle();
        if (!existing) {
            console.warn(`[Coach Apply] Move Block ID ${moveOp.event_id} not found. Attempting resolution...`);
            let resolved = false;
            if (moveOp.title && moveOp.title !== 'Block') {
                const { data: candidates } = await supabase.from('schedule_blocks')
                    .select('id, title, date, start_time, status').eq('user_id', userId)
                    .or(`title.ilike.%${moveOp.title}%,context.ilike.%${moveOp.title}%`);
                if (candidates && candidates.length > 0) {
                    const sorted = candidates.sort((a: any, b: any) => (a.status === 'missed' ? -1 : 1));
                    moveOp.event_id = sorted[0].id;
                    resolved = true;
                }
            }
            if (!resolved) {
                // Find the missed block as fallback
                const { data: missedBlocks } = await supabase.from('schedule_blocks')
                    .select('id, title, date, start_time').eq('user_id', userId).eq('status', 'missed')
                    .order('start_time', { ascending: false }).limit(1);
                if (missedBlocks && missedBlocks.length > 0) {
                    moveOp.event_id = missedBlocks[0].id;
                    moveOp.title = missedBlocks[0].title;
                    console.log(`[Coach Apply] Fallback resolved move_event to missed block: ${missedBlocks[0].title}`);
                }
            }
        }
    }

    // Second pass: Resolve delete_event (lower priority block)
    const deleteOp = patch.ops.find((o: any) => o.op === 'delete_event' || o.op === 'delete');
    if (deleteOp && deleteOp.event_id) {
        const { data: existing } = await supabase.from('schedule_blocks').select('id').eq('id', deleteOp.event_id).eq('user_id', userId).maybeSingle();
        if (!existing) {
            console.warn(`[Coach Apply] Delete Block ID ${deleteOp.event_id} not found. Attempting resolution...`);
            let resolved = false;
            if (deleteOp.title && deleteOp.title !== 'Block') {
                const { data: candidates } = await supabase.from('schedule_blocks')
                    .select('id, title, date, start_time').eq('user_id', userId)
                    .or(`title.ilike.%${deleteOp.title}%,context.ilike.%${deleteOp.title}%`);
                if (candidates && candidates.length > 0) {
                    deleteOp.event_id = candidates[0].id;
                    resolved = true;
                }
            }
            if (!resolved && moveOp && moveOp.date && moveOp.to_start && moveOp.to_end) {
                // Find block at the target move location
                const { data: targetBlocks } = await supabase.from('schedule_blocks')
                    .select('id, title, date, start_time, end_time').eq('user_id', userId)
                    .eq('date', moveOp.date).neq('status', 'missed');
                const overlapped = targetBlocks?.find((b: any) => (b.start_time < moveOp.to_end && b.end_time > moveOp.to_start));
                if (overlapped) {
                    deleteOp.event_id = overlapped.id;
                    deleteOp.title = overlapped.title;
                    console.log(`[Coach Apply] Fallback resolved delete_event to overlapping block: ${overlapped.title}`);
                }
            }
        }
    }
}

/**
 * Server-side validation: reject coach operations that violate hard rules.
 * Returns an array of error strings. Empty = all valid.
 */
async function validateCoachOps(patch: any, userId: string, supabase: any): Promise<string[]> {
    if (!patch.ops || !Array.isArray(patch.ops)) return [];

    const errors: string[] = [];
    const IMMUTABLE_TYPES = ['sleep', 'meal', 'wind_down', 'anchor'];

    // Collect all move/create target slots
    const targetSlots: Array<{ op: string; date: string; start: string; end: string; title: string; blockId?: string }> = [];

    // For move/update ops without full date/time context, look up current state
    const checkBlockIds: string[] = [];
    for (const op of patch.ops) {
        if (op.event_id && ['move_event', 'move', 'update_event', 'update'].includes(op.op)) {
            checkBlockIds.push(op.event_id);
        }
    }

    // Fetch current state for blocks being moved or updated
    let blockDataMap: Record<string, any> = {};
    if (checkBlockIds.length > 0) {
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('id, date, start_time, end_time')
            .eq('user_id', userId)
            .in('id', checkBlockIds);
        if (blocks) {
            blockDataMap = blocks.reduce((acc: Record<string, any>, b: any) => ({ ...acc, [b.id]: b }), {});
        }
    }

    for (const op of patch.ops) {
        if (op.op === 'move_event' || op.op === 'move') {
            const date = op.date || op.new_date || (op.event_id && blockDataMap[op.event_id]?.date);
            const start = op.to_start || op.new_start || (op.event_id && blockDataMap[op.event_id]?.start_time);
            const end = op.to_end || op.new_end || (op.event_id && blockDataMap[op.event_id]?.end_time);
            if (date && start && end) {
                targetSlots.push({ op: 'move', date, start, end, title: op.title || '', blockId: op.event_id });
            }
        }
        if (op.op === 'update_event' || op.op === 'update') {
            const blockData = op.event_id ? blockDataMap[op.event_id] : null;
            if (blockData) {
                const date = op.fields?.date || blockData.date;
                const start = op.fields?.start_time || blockData.start_time;
                const end = op.fields?.end_time || blockData.end_time;
                if (date && start && end) {
                    targetSlots.push({ op: 'update', date, start, end, title: op.title || '', blockId: op.event_id });
                }
            }
        }
        if (op.op === 'create_event' || op.op === 'create') {
            const p = op.payload || {};
            if (p.date && p.start_time && p.end_time) {
                targetSlots.push({ op: 'create', date: p.date, start: p.start_time, end: p.end_time, title: p.title || '' });
            }
        }
    }

    if (targetSlots.length === 0) return [];

    // Get all unique dates we need to check
    const dates = [...new Set(targetSlots.map(s => s.date))];

    // Fetch all blocks on those dates
    const { data: existingBlocks } = await supabase
        .from('schedule_blocks')
        .select('id, title, context, block_type, goal_id, date, start_time, end_time')
        .eq('user_id', userId)
        .in('date', dates);

    if (!existingBlocks) return [];

    // Helper: check if two time ranges overlap
    const overlaps = (s1: string, e1: string, s2: string, e2: string): boolean => {
        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const a1 = toMin(s1), a2 = toMin(e1), b1 = toMin(s2), b2 = toMin(e2);
        return a1 < b2 && b1 < a2;
    };

    // Collect IDs being deleted in this patch (they won't be there after)
    const deletedIds = new Set(
        patch.ops
            .filter((o: any) => o.op === 'delete_event' || o.op === 'delete')
            .map((o: any) => o.event_id)
            .filter(Boolean)
    );

    // Simulate post-patch state for moved/updated blocks
    for (const b of existingBlocks) {
        const moveOp = patch.ops.find((o: any) => (o.op === 'move_event' || o.op === 'move') && o.event_id === b.id);
        if (moveOp) {
            if (moveOp.date || moveOp.new_date) b.date = moveOp.date || moveOp.new_date;
            if (moveOp.to_start || moveOp.new_start) b.start_time = moveOp.to_start || moveOp.new_start;
            if (moveOp.to_end || moveOp.new_end) b.end_time = moveOp.to_end || moveOp.new_end;
        }
        const updateOp = patch.ops.find((o: any) => (o.op === 'update_event' || o.op === 'update') && o.event_id === b.id);
        if (updateOp && updateOp.fields) {
            if (updateOp.fields.date) b.date = updateOp.fields.date;
            if (updateOp.fields.start_time) b.start_time = updateOp.fields.start_time;
            if (updateOp.fields.end_time) b.end_time = updateOp.fields.end_time;
        }
    }


    // Check if the patch includes a replan_day operation, which handles auto-cascading
    const hasReplan = patch.ops.some((o: any) => o.op === 'replan_day' || o.op === 'replan_week');

    // Check each target slot against immutable blocks
    for (const slot of targetSlots) {
        const dayBlocks = existingBlocks.filter((b: any) => b.date === slot.date);
        for (const block of dayBlocks) {
            // Skip the block being moved (it won't be in its old slot anymore)
            if (slot.blockId && block.id === slot.blockId) continue;
            // Skip blocks being deleted in the same patch
            if (deletedIds.has(block.id)) continue;
            
            // Check for overlaps: Coach patches can cascade flexible blocks,
            // so we ONLY reject overlaps with IMMUTABLE blocks (sleep, meal, wind_down, anchor).
            if (IMMUTABLE_TYPES.includes(block.block_type)) {
                if (overlaps(slot.start, slot.end, block.start_time, block.end_time)) {
                    errors.push(
                        `Cannot ${slot.op} "${slot.title}" at ${slot.start}-${slot.end} — overlaps with immutable ${block.block_type} block "${block.title}" (${block.start_time}-${block.end_time})`
                    );
                }
            }
        }
    }

    // Check for same-goal swap: if there's a delete + move/create for the same goal, reject
    const deleteOps = patch.ops.filter((o: any) => o.op === 'delete_event' || o.op === 'delete');
    const moveCreateOps = patch.ops.filter((o: any) =>
        ['move_event', 'move', 'create_event', 'create'].includes(o.op)
    );

    if (deleteOps.length > 0 && moveCreateOps.length > 0) {
        for (const delOp of deleteOps) {
            if (!delOp.event_id) continue;
            const deletedBlock = existingBlocks.find((b: any) => b.id === delOp.event_id);
            if (!deletedBlock || !deletedBlock.goal_id) continue;

            for (const mcOp of moveCreateOps) {
                const mcId = mcOp.event_id || mcOp.block_id;
                if (mcId) {
                    const movedBlock = existingBlocks.find((b: any) => b.id === mcId);
                    if (movedBlock && movedBlock.goal_id === deletedBlock.goal_id) {
                        errors.push(
                            `Same-goal swap rejected: removing "${deletedBlock.title}" and adding/moving "${movedBlock.title}" — both belong to the same goal. This results in no net change.`
                        );
                    }
                }
            }
        }
    }

    return errors;
}
