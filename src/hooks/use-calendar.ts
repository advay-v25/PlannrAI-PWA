
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { apiClient } from '@/lib/api-client';
import type { ScheduleBlock, Goal, Commitment, HabitStack } from '@/types/database';
import { useToast } from '@/components/ui/toast';

export type ViewMode = 'grid' | 'agenda';

export interface CalendarState {
    blocks: (ScheduleBlock & { goal?: Goal })[];
    goals: Goal[];
    commitments: Commitment[];
    habitStacks: HabitStack[];
    inbox: ScheduleBlock[];
    isLoading: boolean;
    error: Error | null;
}

export interface ConflictError {
    conflict: boolean;
    options: any[];
    pendingAction: { type: 'create' | 'move'; payload: any };
}

export function useCalendar(initialDate: Date = new Date()) {
    const router = useRouter();
    const { showToast } = useToast();

    // View State
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');

    // Data State
    const [state, setState] = useState<CalendarState>({
        blocks: [],
        goals: [],
        commitments: [],
        habitStacks: [],
        inbox: [],
        isLoading: true,
        error: null
    });

    // Conflict State
    const [conflictError, setConflictError] = useState<ConflictError | null>(null);

    // AI Undo State
    const [lastUndoToken, setLastUndoToken] = useState<string | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isPlanning, setIsPlanning] = useState(false);



    const loadData = useCallback(async () => {
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            const startStr = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            const endStr = format(addDays(new Date(startStr), 6), 'yyyy-MM-dd');

            const data = await apiClient.schedule.summary(startStr, endStr);

            setState({
                blocks: data.blocks || [],
                goals: data.goals || [],
                commitments: data.commitments || [],
                habitStacks: data.habitStacks || [],
                inbox: data.inbox || [],
                isLoading: false,
                error: null
            });
        } catch (e: any) {
            console.error("Failed to load calendar", e);
            setState(prev => ({ ...prev, isLoading: false, error: e }));
            showToast("Failed to load schedule", "error");
        }
    }, [selectedDate, showToast]);

    // Initial Load & Refresh on Date Change
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Listen for calendar-refresh events (from coach undo)
    useEffect(() => {
        const handler = () => loadData();
        window.addEventListener('calendar-refresh', handler);
        return () => window.removeEventListener('calendar-refresh', handler);
    }, [loadData]);

    // --- Actions ---

    const autoPlace = async (blockId: string, durationMinutes: number) => {
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            await apiClient.schedule.autoPlace({ block_id: blockId, duration_minutes: durationMinutes, target_date: dateStr });
            showToast("Item scheduled", "success");
            await loadData();
        } catch (e: any) {
            showToast(e.message || "Failed to schedule item", "error");
        }
    };

    const refresh = async () => {
        await loadData();
    };

    const addBlock = async (blockData: { start_time: string; end_time: string; context: string; date?: string }) => {
        const date = blockData.date || format(selectedDate, 'yyyy-MM-dd');
        try {
            await apiClient.schedule.createBlock({
                date,
                start_time: blockData.start_time,
                end_time: blockData.end_time,
                context: blockData.context
            });
            showToast("Block added", "success");
            await loadData();
        } catch (e: any) {
            const conflictData = e.data?.error?.details || e.data;
            if (e.status === 409 && conflictData?.conflict) {
                const conflictPrompt = encodeURIComponent(`I just tried to add a block to my schedule but it conflicts. Please help me resolve the conflict for ${blockData.start_time}-${blockData.end_time}.`);
                router.push(`/app/coach?mode=strategic&prompt=${conflictPrompt}`);
                
                setConflictError({
                    conflict: true,
                    options: conflictData.resolution_options,
                    pendingAction: { type: 'create', payload: { ...blockData, date } }
                });
                return;
            }
            showToast(e.message || e.data?.error?.message || "Failed to add block", "error");
        }
    };

    const moveBlock = async (id: string, newStart: string, newEnd: string, newDate?: string) => {
        const targetDate = newDate || format(selectedDate, 'yyyy-MM-dd');

        // Optimistic Update
        const originalBlocks = [...state.blocks];
        setState(prev => ({
            ...prev,
            blocks: prev.blocks.map(b => b.id === id ? { ...b, start_time: newStart, end_time: newEnd, date: targetDate } : b)
        }));

        try {
            await apiClient.schedule.moveBlock(id, targetDate, newStart, newEnd);
            showToast("Block moved", "success");
        } catch (e: any) {
            // Revert
            setState(prev => ({ ...prev, blocks: originalBlocks }));

            const conflictData = e.data?.error?.details || e.data;
            if (e.status === 409 && conflictData?.conflict) {
                // Intercept Conflict -> Auto-Open Coach
                const conflictPrompt = encodeURIComponent(`I just tried to move a block but it conflicts with my schedule. Please help me resolve the conflict for block ID: ${id} to ${newStart}-${newEnd}.`);
                router.push(`/app/coach?mode=strategic&prompt=${conflictPrompt}`);
                
                // Fallback (in case router fails or user goes back, we still have state)
                setConflictError({
                    conflict: true,
                    options: conflictData.resolution_options,
                    pendingAction: { type: 'move', payload: { id, newStart, newEnd, newDate: targetDate } }
                });
                return;
            }
            showToast(e.message || e.data?.error?.message || "Failed to move block", "error");
        }
    };

    const updateBlock = async (id: string, updates: any) => {
        // Optimistic Update
        const originalBlocks = [...state.blocks];
        setState(prev => ({
            ...prev,
            blocks: prev.blocks.map(b => b.id === id ? { ...b, ...updates } : b)
        }));

        try {
            await apiClient.schedule.updateBlock(id, updates);
            showToast("Block updated", "success");
        } catch (e: any) {
            // Revert
            setState(prev => ({ ...prev, blocks: originalBlocks }));
            showToast(e.message || "Failed to update block", "error");
        }
    };

    const deleteBlock = async (id: string) => {
        // Check if this is a virtual anchor block
        if (id.startsWith('virt-cmt-')) {
            // Format: virt-cmt-{uuid}-{yyyy-mm-dd}
            // UUID is 36 chars (8-4-4-4-12), date is 10 chars (yyyy-mm-dd)
            // Use regex to extract reliably
            const match = id.match(/^virt-cmt-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d{4}-\d{2}-\d{2})$/);
            if (match) {
                const cmtId = match[1];
                await deleteCommitment(cmtId);
                return;
            }
            // Fallback: try extracting by slicing off the last 10 chars (date)
            const fullSuffix = id.replace('virt-cmt-', '');
            const cmtId = fullSuffix.slice(0, -(10 + 1)); // -1 for the dash before date
            await deleteCommitment(cmtId);
            return;
        }
        // Block deletion of meal blocks (they're locked like anchors)
        const targetBlock = state.blocks.find(b => b.id === id);
        if (targetBlock?.block_type === 'meal') {
            showToast("Meal blocks are locked and can't be deleted", "error");
            return;
        }

        // Regular block deletion
        const originalBlocks = [...state.blocks];
        setState(prev => ({
            ...prev,
            blocks: prev.blocks.filter(b => b.id !== id)
        }));

        try {
            await apiClient.schedule.deleteBlock(id);
            showToast("Block deleted", "success");
        } catch (e: any) {
            // Revert
            setState(prev => ({ ...prev, blocks: originalBlocks }));
            showToast(e.message || "Failed to delete block", "error");
        }
    };

    const deleteCommitment = async (commitmentId: string) => {
        try {
            await apiClient.schedule.deleteCommitment(commitmentId);
            showToast("Commitment deleted permanently", "success");
            await loadData();
        } catch (e: any) {
            showToast(e.message || "Failed to delete commitment", "error");
        }
    };

    const createCommitment = async (data: { title: string; start_time: string; end_time: string; date: string }) => {
        try {
            await apiClient.schedule.createCommitment({
                title: data.title,
                start_time: data.start_time,
                end_time: data.end_time,
                days_of_week: [new Date(data.date + 'T12:00:00').getDay()]
            });
            showToast("Anchor created", "success");
            await loadData();
        } catch (e: any) {
            showToast(e.message || "Failed to create anchor", "error");
        }
    };

    // AI: Plan Week
    const planWeek = async (options: { mode: 'balanced' | 'momentum' | 'recovery', allow_weekend?: boolean }) => {
        setIsPlanning(true);
        try {
            const startStr = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            const res: any = await apiClient.schedule.planWeek({
                start_date: startStr,
                mode: options.mode,
                allow_weekend: options.allow_weekend ?? false
            });

            // We no longer get changes directly, we get options.
            // Return the options and summary to the UI to render the selection modal.
            return {
                summary: res.plan_summary,
                options: res.options || [],
                warnings: res.warnings || [],
                note: res.donna_note
            };
        } catch (e: any) {
            showToast("Failed to generate plan", "error");
            throw e;
        } finally {
            setIsPlanning(false);
        }
    };

    // AI: Optimize Day
    // When schedule is empty → auto-route to generate-today for a full plan
    const optimizeDay = async (focus?: string) => {
        setIsOptimizing(true);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');

            // If today has no blocks, generate a full plan instead of "optimizing" nothing
            const todayBlocks = state.blocks.filter(b =>
                b.date === dateStr && b.block_type !== 'anchor' && !b.id?.startsWith('virt-cmt-')
            );

            if (todayBlocks.length === 0) {
                // Route to generate-today for a comprehensive plan
                const res: any = await apiClient.post('/api/calendar/generate-today', {
                    date: dateStr,
                    force: true,
                });
                return {
                    analysis: {
                        energy_state: 'ready',
                        schedule_health: 'empty — generating full plan',
                        recommendation: 'Your day has been planned from scratch with AI',
                    },
                    options: res.options || [],
                    warnings: res.warnings || [],
                    note: res.plan_summary,
                };
            }

            // Normal optimize (existing blocks)
            const res: any = await apiClient.schedule.optimizeDay({ date: dateStr, focus });

            return {
                analysis: res.analysis,
                options: res.options || [],
                warnings: res.warnings || [],
                note: res.donna_note
            };
        } catch (e: any) {
            showToast("Failed to optimize day", "error");
            throw e;
        } finally {
            setIsOptimizing(false);
        }
    };

    // Apply User-Selected AI Option
    const applyOption = async (option: any) => {
        try {
            // Extract blocks from the patch ops
            const ops = option.patch?.ops || [];
            const createOps = ops.filter((o: any) => o.op === 'create_event' || o.op === 'create');
            const addBlocks = createOps.map((o: any) => o.payload || o.event || {});

            const updateOps = ops.filter((o: any) => o.op === 'update_event' || o.op === 'move_event');
            const formattedUpdates = updateOps.map((o: any) => ({
                id: o.event_id || o.block_id,
                changes: o.fields || (o.to_start ? { start_time: o.to_start, end_time: o.to_end } : {})
            }));

            const deleteOps = ops.filter((o: any) => o.op === 'delete_event' || o.op === 'delete');
            const removeIds = deleteOps.map((o: any) => o.event_id || o.block_id);

            // Determine affected date range
            const dates = [...new Set(addBlocks.map((b: any) => b.date).filter(Boolean))] as string[];
            const uniqueDates = dates.sort();
            const isSingleDay = uniqueDates.length <= 1;

            const body: any = {
                action: isSingleDay ? 'optimize_day' : 'plan_week',
                variant_id: option.id,
                patch: { 
                    add: addBlocks,
                    update: formattedUpdates,
                    remove: removeIds,
                },
            };

            // Force clear existing schedule when applying a full plan
            if (body.action === 'plan_week' || option.id === 'today_schedule') {
                if (isSingleDay) {
                    body.clear_date = uniqueDates[0] || format(selectedDate, 'yyyy-MM-dd');
                } else {
                    body.clear_week = true;
                    body.week_start = uniqueDates[0] || format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                }
            }

            // Use apply-schedule endpoint
            const result: any = await apiClient.post('/api/calendar/apply-schedule', body);

            if (result.version_id) setLastUndoToken(result.version_id);
            await loadData();
            const total = (result.added || 0);
            showToast(`✅ Plan applied! ${total} blocks created.`, 'success');
        } catch (e: any) {
            showToast("Failed to apply option", "error");
            throw e;
        }
    };

    // AI: Undo last calendar action
    const undoLastCalendarAction = async () => {
        if (!lastUndoToken) return;
        try {
            await apiClient.post('/api/patch/undo', { undo_token: lastUndoToken });
            setLastUndoToken(null);
            await loadData();
            showToast('Undone!', 'success');
        } catch (e: any) {
            showToast("Failed to undo", "error");
        }
    };

    const dismissConflict = () => {
        setConflictError(null);
    };

    // Block status transition
    const updateBlockStatus = async (
        blockId: string,
        status: 'planned' | 'in_progress' | 'done' | 'missed' | 'cancelled' | 'partial',
        opts?: { actual_start_time?: string; actual_end_time?: string; notes?: string }
    ) => {
        try {
            const response = await apiClient.schedule.updateBlockStatus({
                block_id: blockId,
                status,
                ...opts,
            });
            await loadData();
            showToast(`Block ${status === 'done' ? 'completed' : status}`, 'success');
            return response;
        } catch (e: any) {
            showToast(e.message || 'Failed to update status', 'error');
        }
    };

    // Derived State
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const blocksForSelectedDate = state.blocks.filter(b => b.date === selectedDateStr);

    return {
        ...state,
        blocksForSelectedDate,
        selectedDate,
        setSelectedDate,
        viewMode,
        setViewMode,
        refresh,
        autoPlace,
        addBlock,
        moveBlock,
        updateBlock,
        deleteBlock,
        deleteCommitment,
        createCommitment,
        planWeek,
        optimizeDay,
        applyOption,
        isOptimizing,
        isPlanning,
        lastUndoToken,
        undoLastCalendarAction,
        conflictError,
        setConflictError,
        dismissConflict,
        updateBlockStatus,
    };
}
