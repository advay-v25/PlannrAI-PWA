import { useMemo } from 'react';
import { calculateGoalCapacity } from '@/lib/capacity';
import { Goal, Commitment, Profile } from '@/types/database';

export function useCapacity(goals: Goal[], commitments: Commitment[], profile: Partial<Profile> | null) {
    return useMemo(() => {
        if (!profile) return null;
        return calculateGoalCapacity(profile, goals, commitments);
    }, [goals, commitments, profile]);
}
