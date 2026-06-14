'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface InsightsCardProps {
    userState: any;
    insight: any;
}

export function InsightsCard({ userState, insight }: InsightsCardProps) {
    const energyLevel = userState?.energy_level || 3;
    const mood = userState?.emotional_state || 'Neutral';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 backdrop-blur-xl"
        >
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4">Signal</h3>

            <div className="flex items-center gap-4">
                {/* Energy Meter */}
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-[var(--text-secondary)]">Energy</span>
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                            <div
                                key={level}
                                className={cn(
                                    "h-8 w-2 rounded-full transition-all",
                                    level <= energyLevel
                                        ? "bg-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary)]"
                                        : "bg-[var(--glass-bg)]"
                                )}
                            />
                        ))}
                    </div>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-[var(--glass-bg)]" />

                {/* Mood/Insight */}
                <div className="flex-1">
                    <div className="text-sm font-medium text-white capitalize">{mood}</div>
                    <div className="text-xs text-[var(--text-secondary)] leading-tight mt-1 line-clamp-2">
                        {insight?.text || "System normal."}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
