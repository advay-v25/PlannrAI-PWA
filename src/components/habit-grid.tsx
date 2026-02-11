'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Database } from '@/types/database';

type HabitInstance = Database['public']['Tables']['habit_instances']['Row'];

interface HabitGridProps {
    stackId: string;
    instances: HabitInstance[]; // All instances for this stack
    days?: number; // Default 28
}

export function HabitGrid({ stackId, instances, days = 28 }: HabitGridProps) {
    // Generate last 28 days
    const dates = useMemo(() => {
        const result = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            result.push(d.toISOString().split('T')[0]);
        }
        return result;
    }, [days]);

    // Map instances to dates
    // Filter instances for this stackId
    const stackInstances = useMemo(() =>
        instances.filter(i => i.habit_stack_id === stackId),
        [instances, stackId]);

    const completionMap = useMemo(() => {
        const map = new Set(stackInstances.map(i => i.date));
        return map;
    }, [stackInstances]);

    // Group by weeks (7 days per row)
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) {
        weeks.push(dates.slice(i, i + 7));
    }

    return (
        <div className="flex flex-col gap-1">
            {weeks.map((week, wIndex) => (
                <div key={wIndex} className="flex gap-1 justify-between">
                    {week.map((date) => {
                        const isCompleted = completionMap.has(date);
                        const isToday = date === new Date().toISOString().split('T')[0];

                        return (
                            <div
                                key={date}
                                className={cn(
                                    "w-3 h-3 rounded-sm transition-all",
                                    isCompleted
                                        ? "bg-[var(--color-success)] shadow-[0_0_4px_var(--color-success)]"
                                        : "bg-[var(--glass-border)] opacity-20",
                                    isToday && !isCompleted && "border border-[var(--text-tertiary)]"
                                )}
                                title={`${date}${isCompleted ? ': Completed' : ''}`}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
