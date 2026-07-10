'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, PlusCircle, TrendingUp } from 'lucide-react';

interface WeeklyStatsBarProps {
    added: number;
    completed: number;
}

export function WeeklyStatsBar({ added, completed }: WeeklyStatsBarProps) {
    const completionRate = added > 0 ? Math.round((completed / added) * 100) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-4 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm w-full mx-auto"
        >
            {/* Added Stat */}
            <div className="flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="whitespace-nowrap">
                    <span className="font-bold text-[var(--text-primary)]">{added}</span>
                    <span className="text-[var(--text-tertiary)] ml-1">added</span>
                </div>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-[var(--glass-border)]" />

            {/* Completed Stat */}
            <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="whitespace-nowrap">
                    <span className="font-bold text-[var(--text-primary)]">{completed}</span>
                    <span className="text-[var(--text-tertiary)] ml-1">done</span>
                </div>
            </div>

            {/* Completion Rate */}
            {added > 0 && (
                <>
                    <div className="w-px h-4 bg-[var(--glass-border)]" />
                    <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-orange-400 flex-shrink-0" />
                        <div className="whitespace-nowrap">
                            <span className="font-bold text-[var(--text-primary)]">{completionRate}%</span>
                            <span className="text-[var(--text-tertiary)] ml-1">rate</span>
                        </div>
                    </div>
                </>
            )}
        </motion.div>
    );
}
