'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Clock, Coffee, Shield, Zap } from 'lucide-react';

export function Step2Rhythm() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="flex flex-col items-center justify-start space-y-8 w-full max-w-lg mx-auto pb-10">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2 text-center"
            >
                <h2 className="text-3xl font-bold tracking-tight text-white font-mono">
                    YOUR <span className="text-[var(--color-primary)]">DAILY RHYTHM</span>
                </h2>
                <p className="text-[var(--color-text-secondary)]">
                    When does your body naturally operate best?
                </p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="w-full space-y-8"
            >
                {/* 🌙 SLEEP & WAKE */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-lg font-bold text-white uppercase tracking-widest border-b border-[var(--glass-border)] pb-2">
                        <span className="text-xl">🌙</span> SLEEP & WAKE
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Usually fall asleep</label>
                            <input
                                type="time"
                                value={data.sleep_start}
                                onChange={(e) => updateData({ sleep_start: e.target.value })}
                                className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Usually wake up</label>
                            <input
                                type="time"
                                value={data.sleep_end}
                                onChange={(e) => updateData({ sleep_end: e.target.value })}
                                className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                            />
                        </div>
                    </div>

                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Wind-down time before sleep</label>
                        <div className="flex gap-2 flex-wrap">
                            {[15, 30, 45, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ wind_down_mins: mins })}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                        data.wind_down_mins === mins 
                                            ? 'bg-[var(--color-primary)] text-black shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.3)]' 
                                            : 'bg-[var(--glass-surface)] text-[var(--color-text-secondary)] border border-[var(--glass-border)] hover:bg-[var(--bg-card-hover)]'
                                    }`}
                                >
                                    {mins} min
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 🍽️ MEALS */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-lg font-bold text-white uppercase tracking-widest border-b border-[var(--glass-border)] pb-2">
                        <span className="text-xl">🍽️</span> MEALS
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Meals per day</label>
                        <div className="flex gap-2">
                            {[2, 3].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => updateData({ meals_per_day: num as 2 | 3 })}
                                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                                        data.meals_per_day === num 
                                            ? 'bg-[var(--color-primary)] text-black' 
                                            : 'bg-[var(--glass-surface)] text-[var(--color-text-secondary)] border border-[var(--glass-border)] hover:bg-[var(--bg-card-hover)]'
                                    }`}
                                >
                                    {num} meals
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Meal timing preference</label>
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { id: 'early', label: 'Early bird 🌅' },
                                { id: 'normal', label: 'Normal ⏰' },
                                { id: 'late', label: 'Night owl 🌙' }
                            ].map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => updateData({ meal_timing: opt.id as any })}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                        data.meal_timing === opt.id 
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' 
                                            : 'bg-[var(--glass-surface)] text-[var(--color-text-secondary)] border border-[var(--glass-border)] hover:bg-[var(--bg-card-hover)]'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ⏱️ BUFFER TIME */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-lg font-bold text-white uppercase tracking-widest border-b border-[var(--glass-border)] pb-2">
                        <span className="text-xl">⏱️</span> BUFFER TIME
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Space between activities</label>
                        <div className="flex gap-2 flex-wrap">
                            {[5, 10, 15, 20].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ default_buffer_duration: mins })}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                        data.default_buffer_duration === mins 
                                            ? 'bg-[var(--color-primary)] text-black shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.3)]' 
                                            : 'bg-[var(--glass-surface)] text-[var(--color-text-secondary)] border border-[var(--glass-border)] hover:bg-[var(--bg-card-hover)]'
                                    }`}
                                >
                                    {mins} min
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                
            </motion.div>
        </div>
    );
}
