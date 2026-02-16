
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
    isLoading: boolean;
    error: Error | null;
}

export interface ConflictError {
    conflict: boolean;
    options: any[]; // Resolution options
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
        isLoading: true,
        error: null
    });

    // Conflict State (lifted up to expose to UI)
    const [conflictError, setConflictError] = useState<ConflictError | null>(null);

    const { showToast } = useToast();

    const loadData = useCallback(async () => {
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            // For now, fetching single day for blocks, but we might want week range
            // Let's fetch the whole week to support week view navigation smoothly?
            // The Summary API supports start/end.
            const startStr = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            const endStr = format(addDays(new Date(startStr), 6), 'yyyy-MM-dd');

            const data = await apiClient.schedule.summary(startStr, endStr);
            console.log('[useCalendar] Loaded data:', data);

            // Filter blocks for current view if needed, or keeping all in state
            // Let's keep all and let UI filter by day
            setState({
                blocks: data.blocks || [],
                goals: data.goals || [],
                commitments: data.commitments || [],
                habitStacks: data.habitStacks || [],
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

    // --- Actions ---

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
        // Optimistic Update
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

    const planWeek = async (mode: 'balanced' | 'intense' | 'recovery') => {
        try {
            const startStr = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            const res: any = await apiClient.schedule.planWeek({
                start_date: startStr,
                mode,
                allow_weekend: false
            });
            // The API returns options. The UI should display them. 
            // We can return them to the caller
            return res.options;
        } catch (e: any) {
            showToast("Failed to generate plan", "error");
            throw e;
        }
    };

    const optimizeDay = async (focus?: string) => {
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const res: any = await apiClient.schedule.optimizeDay({ date: dateStr, focus });
            // API returns analysis, strategy, and options (patches)
            // We could auto-apply if only 1 option, or return to UI
            return res;
        } catch (e: any) {
            showToast("Failed to optimize day", "error");
            throw e;
        }
    };

    const resolveConflict = async (resolutionPatch: any) => {
        try {
            await apiClient.patch.apply(resolutionPatch, 'conflict_resolution');
            setConflictError(null);
            showToast("Conflict resolved", "success");
            await loadData();
        } catch (e: any) {
            showToast("Failed to apply resolution", "error");
        }
    };

    const applyPatch = async (patch: any) => {
        try {
            await apiClient.patch.apply(patch, 'manual_plan');
            showToast("Plan applied", "success");
            await loadData();
        } catch (e: any) {
            showToast("Failed to apply plan", "error");
        }
    };

    // Derived State (for UI convenience)
    const blocksForSelectedDate = state.blocks.filter(b => isSameDay(new Date(b.date), selectedDate));

    return {
        ...state,
        blocksForSelectedDate, // Helper
        selectedDate,
        setSelectedDate,
        viewMode,
        setViewMode,
        refresh,
        addBlock,
        moveBlock,
        updateBlock,
        deleteBlock,
        planWeek,
        optimizeDay,
        applyPatch,
        conflictError,
        setConflictError, // to clear it
        resolveConflict
    };
}
