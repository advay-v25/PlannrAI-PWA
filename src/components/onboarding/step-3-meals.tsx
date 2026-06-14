'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Utensils, Coffee, Moon } from 'lucide-react';

export function Step3Meals() {
    const { data, updateData } = useOnboardingStore();

    const handleMealCount = (count: number) => {
        updateData({ meals_per_day: count });
    };

    const handleBuffer = (type: 'light' | 'normal' | 'spacious', mins: number) => {
        updateData({ buffer_config: { type, gap_mins: mins } });
    };

    return (
        <div className="h-full flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto w-full">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-display font-light">Fuel & Space</h2>
                <p className="text-[var(--text-secondary)] font-light">
                    This helps PlannrAI space your day realistically.
                </p>
            </div>

            {/* Meals Config */}
            <div className="w-full space-y-4">
                <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold pl-1">Fuel Intake (Meals)</label>
                <div className="grid grid-cols-2 gap-4">
                    {[2, 3].map(count => (
                        <button
                            key={count}
                            onClick={() => handleMealCount(count)}
                            className={`p-6 rounded-2xl border transition-all flex flex-col items-center gap-2 ${data.meals_per_day === count
                                ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
                                : 'bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-60 hover:opacity-100 hover:border-[var(--color-primary)]/50'
                                }`}
                        >
                            <span className="text-2xl">{count === 2 ? '⏳' : '🍽️'}</span>
                            <span className="font-bold">{count} Meals</span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                                {count === 2 ? 'Intermittent / Skip one' : 'Breakfast, Lunch, Dinner'}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Buffers Config */}
            <div className="w-full space-y-4">
                <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold pl-1">Cognitive Spacing (Buffers)</label>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { type: 'light', mins: 5, icon: '⚡', label: 'Tight' },
                        { type: 'normal', mins: 10, icon: '🧠', label: 'Normal' },
                        { type: 'spacious', mins: 15, icon: '🧘', label: 'Spacious' },
                    ].map((opt: any) => (
                        <button
                            key={opt.type}
                            onClick={() => handleBuffer(opt.type, opt.mins)}
                            className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-1 ${data.buffer_config?.type === opt.type
                                ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                : 'bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-60 hover:opacity-100'
                                }`}
                        >
                            <span className="text-xl">{opt.icon}</span>
                            <span className="font-mono font-bold text-sm">{opt.mins}m</span>
                            <span className="text-[10px] uppercase tracking-wider opacity-70">{opt.label}</span>
                        </button>
                    ))}
                </div>
                {/* Micro Payoff: Buffers */}
                {data.buffer_config?.type && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        key={data.buffer_config.type}
                        className="text-center"
                    >
                        <span className="text-[10px] text-[var(--text-tertiary)] flex items-center justify-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-[var(--color-primary)]" />
                            Cognitive switching costs accounted for.
                        </span>
                    </motion.div>
                )}
            </div>

            <p className="text-xs text-[var(--text-secondary)] italic opacity-60 max-w-sm text-center">
                *PlannrAI will attempt to place meals around 8am, 1pm, and 7pm, adjusting for your wake times.
            </p>

            {/* Mirror Moment */}
            <motion.div
                key={data.meals_per_day}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[10px] font-mono text-[var(--color-primary)] uppercase tracking-widest opacity-80"
            >
                Metabolic constraints locked. Logic engine will actively protect these windows.
            </motion.div>
        </div>
    );
}
