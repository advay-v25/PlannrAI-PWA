import { useState, useMemo } from 'react';
import { useGoalsStore, useUserStore } from '@/stores'; // Assuming these exist
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Goal } from '@/types/database';
import { calculateGoalCapacity } from '@/lib/capacity'; // Assuming this exists

export function useGoalsManager() {
    const { goals, setGoals, addGoal, updateGoal: updateStoreGoal, removeGoal, setLoading } = useGoalsStore();
    const { profile } = useUserStore();
    const { showToast } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);

    // Capacity Calculation
    const capacity = useMemo(() => {
        if (!profile) return null;
        return calculateGoalCapacity(profile, goals, []); // Pass commitments if available, or fetch them here
    }, [profile, goals]);

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
            await apiClient.put('/api/goals', { id, ...updates });
        } catch (error) {
            console.error('Failed to update goal:', error);
            showToast('Failed to save changes. Please try again.', 'error');
            // Revert optimistic update? For now, we rely on next fetch or user retry.
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
        } catch (error) {
            console.error('Failed to delete goal:', error);
            showToast('Failed to delete goal on server.', 'error');
        }
    };

    const handleCreateGoal = async (goalData: Partial<Goal>) => {
        try {
            const newGoal = await apiClient.post<Goal>('/api/goals', goalData);
            if (newGoal) {
                addGoal(newGoal as any); // Cast if response type mismatch
                showToast('✅ Goal created successfully!', 'success');
                return newGoal;
            }
        } catch (error) {
            console.error('Failed to create goal:', error);
            showToast('Failed to create goal.', 'error');
            throw error;
        }
    }

    return {
        goals,
        capacity,
        isSyncing,
        updateGoal: handleUpdateGoal,
        deleteGoal: handleDeleteGoal,
        createGoal: handleCreateGoal
    };
}
