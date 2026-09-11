import { useState, useMemo, useCallback } from 'react';
import { useGoalsStore, useUserStore } from '@/stores'; // Assuming these exist
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Goal } from '@/types/database';
import { dispatchAppEvent } from '@/lib/events';

export interface GoalCapacity {
    total_minutes: number;
    used_minutes: number;
    available_minutes: number;
    load_percentage: number;
    over_by_min_per_day: number;
}

export function useGoalsManager() {
    const { goals, setGoals, addGoal, updateGoal: updateStoreGoal, removeGoal, setLoading } = useGoalsStore();
    const { profile } = useUserStore();
    const { showToast } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);
    const [capacity, setCapacity] = useState<GoalCapacity | null>(null);
    /** §4: a load failure, kept apart from "you have no goals". */
    const [loadError, setLoadError] = useState<
        { message: string; rateLimited: boolean; retryAfter: number } | null
    >(null);

    // CRUD Operations
    const handleUpdateGoal = async (id: string, updates: Partial<Goal>) => {
        // 1. Optimistic Update
        updateStoreGoal(id, updates);

        if ('status' in updates) {
            showToast(updates.status === 'paused' ? '⏸️ Goal paused' : '▶️ Goal resumed', 'info');
        }

        // 2. API Call
        setIsSyncing(true);
        try {
            const res = await apiClient.put<{ goal: Goal, scheduleChanged: boolean }>('/api/goals', { id, ...updates });
            // Refresh to get updated capacity if schedule changed or goal updated
            fetchGoals();
            dispatchAppEvent({ type: 'calendar-refresh' });

            // Cross-feature: Notify schedule sync when goal is paused/resumed
            if ('status' in updates || 'is_paused' in updates) {
                dispatchAppEvent({
                    type: 'schedule-recompute',
                    payload: { trigger: 'goal_paused' }
                });
            }
            
            showToast('✅ Changes saved. Calendar updated.', 'success');
            import('@/hooks/use-coach').then(({ useCoach }) => {
                useCoach.getState().refreshContext().catch(console.error);
            });
        } catch (error: any) {
            // §5: show WHAT failed. A generic message here is why a rejected
            // write read as a locked goal rather than an error.
            console.error('Failed to update goal:', error);
            const detail = error?.message || error?.error || '';
            showToast(detail ? `Couldn't save: ${detail}` : 'Failed to save changes. Please try again.', 'error');
            fetchGoals(); // roll the optimistic edit back to what is actually stored
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteGoal = async (id: string) => {
        if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) return;

        removeGoal(id);

        try {
            await apiClient.delete('/api/goals', { id });
            showToast('🗑️ Goal deleted. Calendar updated.', 'info');
            fetchGoals(); // Refresh capacity
            dispatchAppEvent({ type: 'calendar-refresh' });
            import('@/hooks/use-coach').then(({ useCoach }) => {
                useCoach.getState().refreshContext().catch(console.error);
            });
        } catch (error) {
            console.error('Failed to delete goal:', error);
            showToast('Failed to delete goal on server.', 'error');
        }
    };

    const handleCreateGoal = async (goalData: Partial<Goal>) => {
        try {
            const response = await apiClient.post<{ goal: Goal }>('/api/goals', goalData);
            if (response?.goal) {
                addGoal(response.goal);
                showToast('✅ Goal created! Calendar updated.', 'success');
                fetchGoals(); // Refresh capacity
                dispatchAppEvent({ type: 'calendar-refresh' });
                // Cross-feature: Notify schedule sync about new goal
                dispatchAppEvent({
                    type: 'schedule-recompute',
                    payload: { trigger: 'goal_created' }
                });
                import('@/hooks/use-coach').then(({ useCoach }) => {
                    useCoach.getState().refreshContext().catch(console.error);
                });
                return response.goal;
            }
        } catch (error) {
            console.error('Failed to create goal:', error);
            showToast('Failed to create goal.', 'error');
            throw error;
        }
    }

    /**
     * §3: memoised. It was recreated on every render, and
     * `app/goals/[id]/page.tsx` lists it in an effect's dependency array — so
     * every render scheduled another fetch.
     *
     * §4: a load FAILURE is recorded separately from an empty result. "No goals
     * set yet — add your first goal" after a failed fetch is the one message
     * that must never appear: the obvious response is to recreate goals that
     * already exist.
     */
    const fetchGoals = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await apiClient.get<{ goals: Goal[], capacity: GoalCapacity }>('/api/goals');
            if (data?.goals) setGoals(data.goals);
            if (data?.capacity) setCapacity(data.capacity);
        } catch (error: any) {
            console.error('Failed to fetch goals:', error);
            const rateLimited = error?.status === 429;
            const retryAfter = Number(error?.details?.retryAfter) || 0;
            setLoadError({
                message: error?.message || 'Failed to load goals.',
                rateLimited,
                retryAfter,
            });
            showToast(
                rateLimited
                    ? `Too many requests — retrying in ${retryAfter || 60}s.`
                    : "Couldn't load your goals. They're safe — this is a loading problem.",
                'error'
            );
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        goals,
        capacity,
        isSyncing,
        loadError,
        updateGoal: handleUpdateGoal,
        deleteGoal: handleDeleteGoal,
        createGoal: handleCreateGoal,
        fetchGoals
    };
}
