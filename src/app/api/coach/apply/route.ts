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

        // Skip strict pre-flight validation for coach patches — AI may reference
        // virtual or approximate block IDs that CalendarEngine.validatePatch rejects.
        // PatchService will still handle individual op failures gracefully.
        normalizedPatch.undoable = true;

        console.log('[Coach Apply] Applying patch with', normalizedPatch.ops?.length || 0, 'operations');
        console.log('[Coach Apply] Ops:', JSON.stringify(normalizedPatch.ops?.map((o: any) => ({ op: o.op, title: o.payload?.title || o.title })), null, 2));

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

    // Sanitize block_type in any op payload
    function sanitizeBlockType(payload: any) {
        if (payload?.block_type && !VALID_BLOCK_TYPES.includes(payload.block_type)) {
            console.warn(`[Coach Apply] Sanitizing invalid block_type: "${payload.block_type}" → "flex"`);
            payload.block_type = 'flex';
        }
        return payload;
    }

    // If it already has ops[], sanitize and return
    if (patch.ops && Array.isArray(patch.ops)) {
        patch.ops.forEach((op: any) => {
            if (op.payload) sanitizeBlockType(op.payload);
            if (op.event) sanitizeBlockType(op.event);
        });
        return patch;
    }

    // Convert from Coach format (operations[]) to PatchService format (ops[])
    const operations = patch.operations || [];
    const ops = operations.map((operation: any) => {
        const opType = operation.type || operation.op;

        switch (opType) {
            case 'create_block':
            case 'create':
                return {
                    op: 'create_event' as const,
                    payload: {
                        date: operation.data?.date || operation.date,
                        start_time: operation.data?.start_time || operation.start_time,
                        end_time: operation.data?.end_time || operation.end_time,
                        title: operation.data?.title || operation.data?.context || operation.title || 'New Block',
                        block_type: ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'].includes(operation.data?.block_type || operation.block_type) ? (operation.data?.block_type || operation.block_type) : 'flex',
                        goal_id: operation.data?.goal_id || null,
                        pillar: operation.data?.pillar || null,
                        status: 'planned',
                        checklist: operation.data?.checklist || [],
                    },
                };
            case 'move_block':
            case 'move':
                return {
                    op: 'move_event' as const,
                    event_id: operation.block_id || operation.event_id,
                    to_start: operation.new_start || operation.to_start,
                    to_end: operation.new_end || operation.to_end,
                    date: operation.new_date || operation.date,
                };
            case 'update_block':
            case 'update':
                return {
                    op: 'update_event' as const,
                    event_id: operation.block_id || operation.event_id,
                    fields: operation.changes || operation.fields || {},
                };
            case 'delete_block':
            case 'delete':
                return {
                    op: 'delete_event' as const,
                    event_id: operation.block_id || operation.event_id,
                };
            case 'update_goal':
                return {
                    op: 'update_goal' as const,
                    goal_id: operation.goal_id,
                    fields: operation.changes || operation.fields || {},
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
                return operation;
        }
    });

    return {
        ops,
        undoable: patch.undoable !== false,
        reason: patch.reason || 'Coach action',
        scope: patch.scope || 'day',
    };
}
