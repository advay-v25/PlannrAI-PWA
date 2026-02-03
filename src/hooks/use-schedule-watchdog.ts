import { useMemo } from 'react';
import type { ScheduleBlock } from '@/types/database';

export interface ScheduleConflict {
    blockId: string;
    type: 'overlap' | 'energy_mismatch' | 'tight_buffer';
    message: string;
    severity: 'high' | 'medium' | 'low';
}

interface UseScheduleWatchdogProps {
    blocks: ScheduleBlock[];
    energyLevel?: number;
    lowEnergyMode?: boolean;
}

export function useScheduleWatchdog({ blocks, energyLevel, lowEnergyMode }: UseScheduleWatchdogProps) {
    const conflicts = useMemo(() => {
        const issues: ScheduleConflict[] = [];

        // Sort blocks by start time for easier comparison
        const sortedBlocks = [...blocks].sort((a, b) =>
            a.start_time.localeCompare(b.start_time)
        );

        for (let i = 0; i < sortedBlocks.length; i++) {
            const current = sortedBlocks[i];
            const next = sortedBlocks[i + 1];

            // 1. Overlap Detection
            if (next) {
                if (current.end_time > next.start_time) {
                    issues.push({
                        blockId: next.id,
                        type: 'overlap',
                        message: `Starts before "${current.context || 'previous task'}" ends`,
                        severity: 'high'
                    });
                    issues.push({
                        blockId: current.id,
                        type: 'overlap',
                        message: `Clashes with "${next.context || 'next task'}"`,
                        severity: 'high'
                    });
                } else if (current.end_time === next.start_time) {
                    // Strict back-to-back check (optional, maybe just medium severity?)
                    // For now, let's allow it but maybe flag tight buffers for high intensity tasks
                }
            }

            // 2. Energy Mismatch Detection
            // If energy is low (<=2) and task looks intense
            if ((energyLevel && energyLevel <= 2) || lowEnergyMode) {
                // Heuristic: "Deep Work", "Focus", "High Priority" in title/context
                // Or if we had category data attached (which we might need to pass in)
                const isIntense = /deep|focus|sprint|heavy/i.test(current.context || '');
                if (isIntense) {
                    issues.push({
                        blockId: current.id,
                        type: 'energy_mismatch',
                        message: "High focus task during low energy. Consider rescheduling.",
                        severity: 'medium'
                    });
                }
            }
        }

        return issues;
    }, [blocks, energyLevel, lowEnergyMode]);

    return {
        conflicts,
        hasConflicts: conflicts.some(c => c.severity === 'high'),
        hasWarnings: conflicts.some(c => c.severity === 'medium')
    };
}
