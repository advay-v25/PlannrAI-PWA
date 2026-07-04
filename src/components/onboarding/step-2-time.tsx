
'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Moon, Sun, Clock } from 'lucide-react';

export function Step2Time() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="h-full flex flex-col items-center justify-center space-y-8 md:space-y-12">
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
                    className="text-[var(--text-secondary)] font-light"
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

            <div className="w-full max-w-2xl flex flex-col gap-3">
                {/* Morning Buffer Input */}
                <div className="px-6 py-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🌅</span>
                        <div>
                            <p className="font-bold text-sm">Morning Buffer</p>
                            <p className="text-xs text-[var(--text-secondary)]">Ease into your day</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 flex-1 justify-end">
                        <input
                            type="range"
                            min={0} max={120} step={5}
                            value={data.morning_routine_mins || 0}
                            onChange={(e) => updateData({ morning_routine_mins: Number(e.target.value) })}
                            className="w-24 md:w-32 accent-amber-400"
                        />
                        <span className="font-mono font-bold w-12 text-right">{data.morning_routine_mins || 0}m</span>
                    </div>
                </div>

                {/* Wind Down Input */}
                <div className="px-6 py-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🌬️</span>
                        <div>
                            <p className="font-bold text-sm">Wind-down Protocol</p>
                            <p className="text-xs text-[var(--text-secondary)]">Disconnect before sleep</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 flex-1 justify-end">
                        <input
                            type="range"
                            min={15} max={120} step={15}
                            value={data.wind_down_mins || 45}
                            onChange={(e) => updateData({ wind_down_mins: Number(e.target.value) })}
                            className="w-24 md:w-32 accent-indigo-400"
                        />
                        <span className="font-mono font-bold w-12 text-right">{data.wind_down_mins || 45}m</span>
                    </div>
                </div>
            </div>

            {/* Visualizer (Concrete Day Frame) */}
            <DayFrameVisualizer sleepStart={data.sleep_start} sleepEnd={data.sleep_end} windDown={data.wind_down_mins || 45} morningBuffer={data.morning_routine_mins || 0} />
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
                <Clock className="w-4 h-4 text-[var(--text-tertiary)] opacity-50" />
            </div>

            <div className="space-y-1">
                <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-secondary)]">
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
                    <div className="absolute inset-0 bg-[var(--color-primary)]/20 blur-xl opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
                </div>
            </div>
        </motion.div>
    );
}

function DayFrameVisualizer({ sleepStart, sleepEnd, windDown, morningBuffer }: { sleepStart: string, sleepEnd: string, windDown: number, morningBuffer: number }) {
    // Simple visual representation of the 24h cycle
    // We assume standard day for visualization: 00:00 to 24:00
    // But since it's a cycle, we can just show a bar: Sleep -> Wake -> [Active] -> WindDown -> Sleep

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full space-y-2"
        >
            <div className="flex justify-between text-xs text-[var(--text-tertiary)] font-mono uppercase">
                <span>{sleepEnd} Wake</span>
                <span className="text-indigo-300 hidden md:inline">-{windDown}m / +{morningBuffer}m</span>
                <span>{sleepStart} Sleep</span>
            </div>
            <div className="h-4 w-full bg-[var(--glass-border)] rounded-full overflow-hidden flex">
                {morningBuffer > 0 && (
                    <div className="h-full bg-amber-900 w-[10%] opacity-50 border-r border-white/10" title="Morning Buffer" />
                )}
                <div className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-indigo-400 flex-1 opacity-80" />
                {windDown > 0 && (
                    <div className="h-full bg-indigo-900 w-[10%] opacity-50 border-l border-white/10" title="Wind Down" />
                )}
            </div>
            <p className="text-center text-xs text-[var(--text-tertiary)] pt-2">
                Your calibration creates a human day frame.
            </p>

            {/* Micro Payoff: Active Capacity */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-4 flex flex-col items-center gap-1"
            >
                <div className="px-3 py-1 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 text-[10px] uppercase font-mono tracking-wider text-[var(--color-primary)]">
                    Calculated Active Capacity: {calculateCapacity(sleepEnd, sleepStart)}
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)] opacity-60">
                    Calibrating scheduler...
                </span>
            </motion.div>
        </motion.div>
    )
}

function calculateCapacity(start: string, end: string) {
    if (!start || !end) return "--h --m";
    // Simple calc assuming same day or next day wraparound doesn't matter for pure hours diff typically 
    // but here sleep_start (23:00) > sleep_end (07:00) usually
    // We want Wake -> Sleep duration

    const [h1, m1] = start.split(':').map(Number); // Wake
    const [h2, m2] = end.split(':').map(Number);   // Sleep

    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60; // handle wrap around midnight

    const h = Math.floor(diff / 60);
    const m = diff % 60;

    return `${h}h ${m}m`;
}
