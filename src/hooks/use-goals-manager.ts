import { useState, useMemo } from 'react';
import { useGoalsStore, useUserStore } from '@/stores'; // Assuming these exist
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Goal } from '@/types/database';

export interface GoalCapacity {
    total_minutes: number;
    used_minutes: number;
    available_minutes: number;
    load_percentage: number;
}

export function useGoalsManager() {
    const { goals, setGoals, addGoal, updateGoal: updateStoreGoal, removeGoal, setLoading } = useGoalsStore();
    const { profile } = useUserStore();
    const { showToast } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);
    const [capacity, setCapacity] = useState<GoalCapacity | null>(null);

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
            window.dispatchEvent(new CustomEvent('calendar-refresh'));
        } catch (error) {
            console.error('Failed to update goal:', error);
            showToast('Failed to save changes. Please try again.', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteGoal = async (id: string) => {
        if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) return;

        removeGoal(id);

        try {
            await apiClient.delete('/api/goals', { id });
            showToast('🗑️ Goal deleted', 'info');
            fetchGoals(); // Refresh capacity
            window.dispatchEvent(new CustomEvent('calendar-refresh'));
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
                showToast('✅ Goal created successfully!', 'success');
                fetchGoals(); // Refresh capacity
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
                return response.goal;
            }
        } catch (error) {
            console.error('Failed to create goal:', error);
            showToast('Failed to create goal.', 'error');
            throw error;
        }
    }

    const fetchGoals = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get<{ goals: Goal[], capacity: GoalCapacity }>('/api/goals');
            if (data?.goals) {
                setGoals(data.goals);
            }
            if (data?.capacity) {
                setCapacity(data.capacity);
            }
        } catch (error) {
            console.error('Failed to fetch goals:', error);
            showToast('Failed to load goals.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return {
        goals,
        capacity,
        isSyncing,
        updateGoal: handleUpdateGoal,
        deleteGoal: handleDeleteGoal,
        createGoal: handleCreateGoal,
        fetchGoals
    };
}
