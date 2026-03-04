
import { useState, useEffect, useCallback } from 'react';
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

export function useCalendar() {
    // View State
    const [selectedDate, setSelectedDate] = useState(new Date());
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

    const { showToast } = useToast();

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

    // Listen for calendar-refresh events (from coach/brain-dump undo)
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
            if (e.status === 409 && e.data?.conflict) {
                setConflictError({
                    conflict: true,
                    options: e.data.resolution_options,
                    pendingAction: { type: 'create', payload: { ...blockData, date } }
                });
                return;
            }
            showToast(e.message || "Failed to add block", "error");
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

            if (e.status === 409 && e.data?.conflict) {
                setConflictError({
                    conflict: true,
                    options: e.data.resolution_options,
                    pendingAction: { type: 'move', payload: { id, newStart, newEnd, newDate: targetDate } }
                });
                return;
            }
            showToast(e.message || "Failed to move block", "error");
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
            // Extract the commitment ID: "virt-cmt-{commitmentId}-{date}"
            const parts = id.replace('virt-cmt-', '').split('-');
            // UUID is everything except the last part (date)
            const commitmentId = parts.slice(0, -3).join('-');
            // The date is the last three parts joined with -
            // Actually the format is virt-cmt-{uuid}-{yyyy}-{mm}-{dd}
            // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 groups)
            // So we need to extract properly
            const fullSuffix = id.replace('virt-cmt-', '');
            // Find the date at the end (yyyy-mm-dd = 10 chars)
            const dateStr = fullSuffix.slice(-10);
            const cmtId = fullSuffix.slice(0, -(10 + 1)); // -1 for the dash before date
            await deleteCommitment(cmtId);
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
                days_of_week: [new Date(data.date).getDay()]
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
    const optimizeDay = async (focus?: string) => {
        setIsOptimizing(true);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
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
            // Apply the patch via the PatchService apply endpoint
            const result: any = await apiClient.post('/api/patch/apply', {
                patch: option.patch,
                context: option.id
            });

            if (result.undo_token) setLastUndoToken(result.undo_token);
            await loadData();
            showToast(`✅ Option applied! (${result.changes} changes)`, 'success');
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

    // Derived State
    const blocksForSelectedDate = state.blocks.filter(b => isSameDay(new Date(b.date), selectedDate));

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
        dismissConflict
    };
}
