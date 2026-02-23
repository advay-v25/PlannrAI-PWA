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

        // 1. Fetch Deep Context
        const { buildFeatureContext } = await import('@/lib/services/feature-context');
        const featureCtx = await buildFeatureContext(userId, supabase, {
            includeChatHistory: true,
            includeRecentDumps: true,
            includeHabitStacks: true,
            weekDays: 1 // optimize day only needs immediate schedule
        });

        const allBlocks = featureCtx.schedule || [];
        const blocks = allBlocks.filter((b: any) => b.date === dateStr && b.status !== 'inbox');
        const inboxTasks = allBlocks.filter((b: any) => b.status === 'inbox');
        const goals = featureCtx.goals;
        const anchors = featureCtx.anchors;
        const prefs = featureCtx.preferences;

        // 2. Call AI with full holistic context
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
                    user_state: featureCtx.userState,
                    capacity: featureCtx.capacity,
                    recent_brain_dumps: featureCtx.recentDumps,
                    recent_coach_chats: featureCtx.chatHistory,
                    habit_stacks: featureCtx.habitStacks?.map((h: any) => ({
                        name: h.name || h.trigger_habit,
                        preferred_window: h.preferred_window,
                        duration_mins: h.action_duration_mins
                    })),
                    inbox_tasks: inboxTasks.map((t: any) => ({
                        id: t.id,
                        title: t.title,
                        estimated_minutes: t.meta?.estimated_minutes || 30
                    })),
                    blocks: blocks.map((b: any) => ({
                        id: b.id,
                        title: b.title || 'Untitled',
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
                        pillar: g.pillar,
                        ai_plan: g.ai_plan // Ensure goals milestones are visible
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

                // Auto-repair overlap
                const duration = newEnd - newStart;
                let currentStart = newStart;
                let currentEnd = newEnd;
                let hasOverlap = true;

                while (hasOverlap && currentEnd <= 1380) { // Max 23:00
                    hasOverlap = occupiedSlots.some(slot =>
                        currentStart < slot.end && currentEnd > slot.start
                    );
                    if (hasOverlap) {
                        currentStart += 15;
                        currentEnd += 15;
                    }
                }

                if (hasOverlap) continue;

                // Format back to HH:MM
                const formatTime = (mins: number) => {
                    const h = Math.floor(mins / 60).toString().padStart(2, '0');
                    const m = (mins % 60).toString().padStart(2, '0');
                    return `${h}:${m}`;
                };

                patchOps.push({
                    op: 'create_event',
                    event: {
                        date: change.date || dateStr,
                        start_time: formatTime(currentStart),
                        end_time: formatTime(currentEnd),
                        title: change.block_title,
                        block_type: change.block_type || 'task',
                        status: 'planned'
                    }
                });

                // Track new slot
                occupiedSlots.push({ id: 'new', start: currentStart, end: currentEnd });

            } else if (change.action === 'move') {
                let blockId = change.block_id;
                if (!blockId) {
                    const match = allBlocks.find((b: any) =>
                        (b.title || b.context || '').toLowerCase() === (change.block_title || '').toLowerCase()
                    );
                    blockId = match?.id;
                }
                if (blockId && change.new_start_time && change.new_end_time) {
                    const newStart = timeToMinutes(change.new_start_time);
                    const newEnd = timeToMinutes(change.new_end_time);
                    if (newEnd <= newStart) continue;

                    // Auto-repair overlap for move
                    const duration = newEnd - newStart;
                    let currentStart = newStart;
                    let currentEnd = newEnd;
                    let hasOverlap = true;

                    while (hasOverlap && currentEnd <= 1380) {
                        hasOverlap = occupiedSlots.some(slot =>
                            slot.id !== blockId && currentStart < slot.end && currentEnd > slot.start
                        );
                        if (hasOverlap) {
                            currentStart += 15;
                            currentEnd += 15;
                        }
                    }
                    if (hasOverlap) continue;

                    // Update tracked position
                    const existing = occupiedSlots.find(s => s.id === blockId);
                    if (existing) {
                        existing.start = currentStart;
                        existing.end = currentEnd;
                    }

                    // Format back to HH:MM
                    const formatTime = (mins: number) => {
                        const h = Math.floor(mins / 60).toString().padStart(2, '0');
                        const m = (mins % 60).toString().padStart(2, '0');
                        return `${h}:${m}`;
                    };

                    const originalBlock = allBlocks.find(b => b.id === blockId);
                    const isFromInbox = originalBlock?.status === 'inbox';

                    patchOps.push({
                        op: 'move_event',
                        event_id: blockId,
                        to_start: formatTime(currentStart),
                        to_end: formatTime(currentEnd),
                        date: change.date || dateStr,
                        payload: isFromInbox ? { status: 'planned' } : {}
                    });
                }
            } else if (change.action === 'delete') {
                let blockId = change.block_id;
                if (!blockId) {
                    const match = allBlocks.find((b: any) =>
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
