'use client';

import { motion } from 'framer-motion';
import { Target, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Metrics {
    planned_min: number;
    completed_min: number;
}

interface ProgressBarsProps {
    daily?: Metrics;
    weekly?: Metrics;
}

export function ProgressBars({ daily, weekly }: ProgressBarsProps) {
    if (!daily || !weekly) return null;

    const dailyPercent = daily.planned_min > 0 ? Math.min(100, Math.round((daily.completed_min / daily.planned_min) * 100)) : 0;
    const weeklyPercent = weekly.planned_min > 0 ? Math.min(100, Math.round((weekly.completed_min / weekly.planned_min) * 100)) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl space-y-5"
        >
            {/* Daily Bar */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-bold uppercase tracking-widest text-white/60">Today</span>
                    </div>
                    <span className="text-xs font-bold text-white">{dailyPercent}%</span>
                </div>
                <div className="h-2.5 w-full bg-black/40 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${dailyPercent}%` }}
                        transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 rounded-full"
                    />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-white/40 font-mono uppercase tracking-wider">
                    <span>{Math.round(daily.completed_min / 60)}h {Math.round(daily.completed_min % 60)}m done</span>
                    <span>{Math.round(daily.planned_min / 60)}h {Math.round(daily.planned_min % 60)}m planned</span>
                </div>
            </div>

            <div className="border-t border-white/5" />

            {/* Weekly Bar */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold uppercase tracking-widest text-white/60">This Week</span>
                    </div>
                    <span className="text-xs font-bold text-white">{weeklyPercent}%</span>
                </div>
                <div className="h-2.5 w-full bg-black/40 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${weeklyPercent}%` }}
                        transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full"
                    />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-white/40 font-mono uppercase tracking-wider">
                    <span>{Math.round(weekly.completed_min / 60)}h {Math.round(weekly.completed_min % 60)}m done</span>
                    <span>{Math.round(weekly.planned_min / 60)}h {Math.round(weekly.planned_min % 60)}m planned</span>
                </div>
            </div>
        </motion.div>
    );
}
