import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { startOfDay, format, parseISO } from 'date-fns';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { date, focus } = body as {
            date: string;
            focus?: 'reduce_overwhelm' | 'maximize_output' | 'rebalance_pillars'
        };

        const targetDate = date ? parseISO(date) : startOfDay(new Date());
        const dateStr = format(targetDate, 'yyyy-MM-dd');

        // 1. Fetch Context with REAL IDs
        const [currentBlocksRes, goalsRes, anchorsRes, prefsRes] = await Promise.all([
            supabase.from('schedule_blocks')
                .select('id, title, context, start_time, end_time, block_type, status, pillar, goal_id, is_focus, date')
                .eq('user_id', userId)
                .eq('date', dateStr)
                .neq('status', 'cancelled')
                .order('start_time'),
            supabase.from('goals')
                .select('id, title, importance, category, status, pillar')
                .eq('user_id', userId)
                .eq('is_paused', false),
            supabase.from('commitments')
                .select('id, title, start_time, end_time, days_of_week')
                .eq('user_id', userId)
                .eq('is_active', true),
            supabase.from('profile_preferences')
                .select('sleep_start, wake_time, buffer_min')
                .eq('user_id', userId)
                .maybeSingle()
        ]);

        const blocks = currentBlocksRes.data || [];
        const goals = goalsRes.data || [];
        const anchors = anchorsRes.data || [];
        const prefs = prefsRes.data || {};

        // 2. Call AI with real block IDs in context
        let aiResponse: any;
        try {
            const { executeAI } = await import('@/lib/ai/ai-service');

            aiResponse = await executeAI(userId, {
                channel: 'calendar_optimize_day',
                input: `Optimize schedule for ${dateStr}. Focus: ${focus || 'balance'}`,
                context: {
                    date: dateStr,
                    focus,
                    profile: prefs,
                    blocks: blocks.map((b: any) => ({
                        id: b.id,
                        title: b.title || b.context || 'Untitled',
                        start_time: b.start_time,
                        end_time: b.end_time,
                        block_type: b.block_type || 'task',
                        status: b.status,
                        pillar: b.pillar,
                        goal_id: b.goal_id,
                        is_focus: b.is_focus
                    })),
                    goals: goals.map((g: any) => ({
                        id: g.id,
                        title: g.title,
                        importance: g.importance,
                        category: g.category,
                        pillar: g.pillar
                    })),
                    anchors: anchors.map((a: any) => ({
                        title: a.title,
                        start_time: a.start_time,
                        end_time: a.end_time,
                        days_of_week: a.days_of_week
                    }))
                }
            });
        } catch (aiErr: any) {
            console.error('[OptimizeDay] AI call failed:', aiErr);
            return apiSuccess({
                analysis: { energy_state: 'error', schedule_health: 'balanced', flow_opportunity: `DEBUG: ${aiErr.message}` },
                strategy: { main_focus: 'No changes', changes_made: 'AI call failed', reality_check_applied: false },
                changes: 0,
                undo_token: null,
                donna_note: `DEBUG OPTIMIZE ERROR: ${aiErr.message || 'Unknown AI service error'}. Please take a screenshot.`
            });
        }

        // 3. Convert AI changes to PatchService ops with overlap validation
        const changes = aiResponse?.changes || [];
        const patchOps: any[] = [];

        // Build current time occupation map for create validation
        const occupiedSlots = blocks.map((b: any) => ({
            id: b.id,
            start: timeToMinutes(b.start_time),
            end: timeToMinutes(b.end_time)
        }));

        for (const change of changes) {
            if (change.action === 'create') {
                const newStart = timeToMinutes(change.new_start_time);
                const newEnd = timeToMinutes(change.new_end_time);

                // Skip invalid
                if (newEnd <= newStart) continue;

                // Check overlap with existing blocks
                const hasOverlap = occupiedSlots.some(slot =>
                    newStart < slot.end && newEnd > slot.start
                );
                if (hasOverlap) continue;

                patchOps.push({
                    op: 'create_event',
                    event: {
                        date: change.date || dateStr,
                        start_time: change.new_start_time,
                        end_time: change.new_end_time,
                        title: change.block_title,
                        block_type: change.block_type || 'task',
                        status: 'planned'
                    }
                });

                // Track new slot
                occupiedSlots.push({ id: 'new', start: newStart, end: newEnd });

            } else if (change.action === 'move') {
                let blockId = change.block_id;
                if (!blockId) {
                    const match = blocks.find((b: any) =>
                        (b.title || b.context || '').toLowerCase() === (change.block_title || '').toLowerCase()
                    );
                    blockId = match?.id;
                }
                if (blockId && change.new_start_time && change.new_end_time) {
                    const newStart = timeToMinutes(change.new_start_time);
                    const newEnd = timeToMinutes(change.new_end_time);
                    if (newEnd <= newStart) continue;

                    // Check overlap with OTHER blocks (not the one being moved)
                    const hasOverlap = occupiedSlots.some(slot =>
                        slot.id !== blockId && newStart < slot.end && newEnd > slot.start
                    );
                    if (hasOverlap) continue;

                    // Update tracked position
                    const existing = occupiedSlots.find(s => s.id === blockId);
                    if (existing) {
                        existing.start = newStart;
                        existing.end = newEnd;
                    }

                    patchOps.push({
                        op: 'move_event',
                        event_id: blockId,
                        to_start: change.new_start_time,
                        to_end: change.new_end_time,
                        date: change.date || dateStr
                    });
                }
            } else if (change.action === 'delete') {
                let blockId = change.block_id;
                if (!blockId) {
                    const match = blocks.find((b: any) =>
                        (b.title || b.context || '').toLowerCase() === (change.block_title || '').toLowerCase()
                    );
                    blockId = match?.id;
                }
                if (blockId) {
                    patchOps.push({
                        op: 'delete_event',
                        event_id: blockId
                    });

                    // Remove from occupied slots
                    const idx = occupiedSlots.findIndex(s => s.id === blockId);
                    if (idx !== -1) occupiedSlots.splice(idx, 1);
                }
            }
        }

        // 4. Apply via PatchService (with undo support!)
        let undoToken: string | null = null;
        let patchChanges = 0;

        if (patchOps.length > 0) {
            const result = await PatchService.applyPatch(
                userId,
                { ops: patchOps, reason: `Optimize day: ${dateStr}`, undoable: true },
                supabase,
                'calendar_optimize'
            );
            undoToken = result.undo_token;
            patchChanges = result.changes;
        }

        return apiSuccess({
            analysis: aiResponse?.analysis,
            strategy: aiResponse?.strategy,
            changes: patchChanges,
            undo_token: undoToken,
            donna_note: aiResponse?.donna_note || `Day optimized — ${patchChanges} changes applied.`
        });
    },
    { requireAuth: true }
);

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
