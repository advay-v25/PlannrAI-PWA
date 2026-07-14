'use client';

import { motion } from 'framer-motion';
import { Target, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Metrics {
    planned_min: number;
    completed_min: number;
    planned_items?: number;
    completed_items?: number;
}

interface ProgressBarsProps {
    daily?: Metrics;
    weekly?: Metrics;
}

export function ProgressBars({ daily, weekly }: ProgressBarsProps) {
    if (!daily || !weekly) return null;

    const dailyPercent = daily.planned_items && daily.planned_items > 0 ? Math.min(100, Math.round((daily.completed_items! / daily.planned_items) * 100)) : 0;
    const weeklyPercent = weekly.planned_items && weekly.planned_items > 0 ? Math.min(100, Math.round((weekly.completed_items! / weekly.planned_items) * 100)) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 backdrop-blur-xl space-y-6 shadow-[var(--shadow-sm)]"
        >
            {/* Daily Bar */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-[var(--color-primary)]" />
                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Today</span>
                    </div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">{dailyPercent}%</span>
                </div>
                <div className="h-2 w-full bg-[var(--glass-border)] rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${dailyPercent}%` }}
                        transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                        className="h-full bg-[var(--color-primary)] rounded-full shadow-[0_0_10px_var(--color-primary-glow)]"
                    />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    <span>
                        {daily.completed_items === 0 || !daily.completed_items 
                            ? "Starting fresh" 
                            : `${daily.completed_items} ${daily.completed_items === 1 ? 'item' : 'items'} done`}
                    </span>
                    <span>{daily.planned_items || 0} items planned</span>
                </div>
            </div>

            <div className="border-t border-[var(--glass-border)]" />

            {/* Weekly Bar */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-[var(--color-mind)]" />
                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">This Week</span>
                    </div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">{weeklyPercent}%</span>
                </div>
                <div className="h-2 w-full bg-[var(--glass-border)] rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${weeklyPercent}%` }}
                        transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
                        className="h-full bg-[var(--color-mind)] rounded-full shadow-[0_0_10px_var(--color-mind-glow)]"
                    />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    <span>
                        {weekly.completed_items === 0 || !weekly.completed_items
                            ? "Week starts now" 
                            : `${weekly.completed_items} ${weekly.completed_items === 1 ? 'item' : 'items'} done`}
                    </span>
                    <span>{weekly.planned_items || 0} items planned</span>
                </div>
            </div>
        </motion.div>
    );
}
