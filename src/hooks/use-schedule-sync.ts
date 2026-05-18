/**
 * ⚡ PLANNRAI — SCHEDULE SYNC HOOK
 * 
 * Listens for `schedule-recompute` events dispatched by other features
 * (energy check-in, todo changes, goal mutations) and offers the user
 * an option to re-optimize today's schedule based on the new context.
 */

'use client';

import { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

export type ScheduleStrategy = 'momentum' | 'balanced' | 'recovery';

export interface ScheduleModeBanner {
    strategy: ScheduleStrategy;
    label: string;
    message: string;
    type: 'momentum' | 'recovery' | null;
    actionLabel: string;
}

interface ScheduleSyncOptions {
    onCalendarRefresh?: () => void;
}

export function useScheduleSync(options?: ScheduleSyncOptions) {
    const [currentMode, setCurrentMode] = useState<ScheduleModeBanner | null>(null);
    const [isReoptimizing, setIsReoptimizing] = useState(false);

    const handleReoptimize = useCallback(async () => {
        setIsReoptimizing(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            await apiClient.post('/api/ai/optimize-day', {
                date: today,
                blocks: [],
                energyLevel: 0, // Let the protocol auto-detect from user_states
            });
            toast.success('Schedule re-optimized for your current energy!');
            window.dispatchEvent(new Event('calendar-refresh'));
            options?.onCalendarRefresh?.();
        } catch (e) {
            toast.error('Failed to re-optimize schedule');
        } finally {
            setIsReoptimizing(false);
        }
    }, [options]);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            const { trigger, schedule_mode, banner } = detail;

            console.log(`[ScheduleSync] Received recompute event: trigger=${trigger}`);

            // Update the mode banner if provided
            if (banner) {
                setCurrentMode({
                    strategy: schedule_mode || 'balanced',
                    label: banner.schedule_mode_label || 'Balanced Mode',
                    message: banner.message || '',
                    type: banner.type || null,
                    actionLabel: banner.action_label || 'Re-optimize',
                });
            }

            // Auto-trigger calendar refresh for simple cases
            if (trigger === 'todo_completed' || trigger === 'goal_paused') {
                window.dispatchEvent(new Event('calendar-refresh'));
                options?.onCalendarRefresh?.();
            }

            // For energy-driven changes, suggest re-optimization via toast
            if (trigger === 'energy_checkin' && detail.should_reoptimize) {
                toast(detail.suggestion || 'Energy changed. Re-optimize?', {
                    action: {
                        label: detail.banner?.action_label || 'Re-optimize',
                        onClick: handleReoptimize,
                    },
                    duration: 8000,
                });
            }
        };

        window.addEventListener('schedule-recompute', handler);
        return () => window.removeEventListener('schedule-recompute', handler);
    }, [handleReoptimize, options]);

    return {
        currentMode,
        isReoptimizing,
        handleReoptimize,
        clearMode: () => setCurrentMode(null),
    };
}
