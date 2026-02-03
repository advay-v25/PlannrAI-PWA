
'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Moon, Sun, Clock } from 'lucide-react';

export function Step2Time() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="h-full flex flex-col items-center justify-center space-y-12">
            <div className="text-center space-y-2">
                <motion.h2
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-3xl font-display font-light"
                >
                    Circadian Rhythm
                </motion.h2>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-[var(--color-text-secondary)] font-light"
                >
                    Define your active cycle for optimal energy management.
                </motion.p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 w-full">
                {/* Sleep Input */}
                <TimeCard
                    icon={<Moon className="w-6 h-6 text-indigo-400" />}
                    label="System Standby"
                    sublabel="(Sleep)"
                    value={data.sleep_start || '23:00'}
                    onChange={(val: string) => updateData({ sleep_start: val })}
                    delay={0.3}
                    gradient="from-indigo-900/40 to-purple-900/10"
                />

                {/* Wake Input */}
                <TimeCard
                    icon={<Sun className="w-6 h-6 text-amber-400" />}
                    label="System Online"
                    sublabel="(Wake)"
                    value={data.sleep_end || '07:00'}
                    onChange={(val: string) => updateData({ sleep_end: val })}
                    delay={0.4}
                    gradient="from-amber-900/40 to-orange-900/10"
                />
            </div>

            {/* Visualizer (Abstract) */}
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                className="w-full h-2 bg-[var(--glass-border)] rounded-full overflow-hidden relative"
            >
                {/* This would ideally visualize the sleep block on a linear timeline */}
                <div className="absolute inset-0 opacity-30 bg-gradient-to-r from-indigo-500 via-amber-500 to-indigo-500" />
            </motion.div>
        </div>
    );
}

function TimeCard({ icon, label, sublabel, value, onChange, delay, gradient }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay }}
            className={`relative p-6 rounded-2xl border border-[var(--glass-border)] bg-gradient-to-br ${gradient} backdrop-blur-sm group hover:border-[var(--color-primary)]/50 transition-colors cursor-pointer`}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-black/40 backdrop-blur-md">
                    {icon}
                </div>
                <Clock className="w-4 h-4 text-[var(--color-text-tertiary)] opacity-50" />
            </div>

            <div className="space-y-1">
                <p className="text-xs font-mono uppercase tracking-widest text-[var(--color-text-secondary)]">
                    {label} <span className="opacity-50">{sublabel}</span>
                </p>
                <div className="relative">
                    <input
                        type="time"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-transparent text-4xl font-mono text-white focus:outline-none cursor-pointer relative z-10"
                    />
                    {/* Glow effect under text */}
                    <div className="absolute inset-0 bg-[var(--color-primary)]/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </div>
        </motion.div>
    );
}
