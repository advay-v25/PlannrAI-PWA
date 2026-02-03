
'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Battery, Activity } from 'lucide-react';

export function Step4Baseline() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="h-full flex flex-col justify-center space-y-12">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-display font-light">System Calibration</h2>
                <p className="text-[var(--color-text-secondary)] font-light">
                    Establish your current operating parameters.
                </p>
            </div>

            <div className="space-y-8 px-4">

                {/* Energy Level */}
                <CalibrationSlider
                    icon={<Battery className="w-5 h-5 text-emerald-400" />}
                    label="Energy Reserves"
                    value={data.energy_level}
                    onChange={(val: number) => updateData({ energy_level: val })}
                    color="bg-emerald-500"
                    glow="shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    descriptions={["Depleted", "Low", "Stable", "High", "Maximum"]}
                />

                {/* Stress Level */}
                <CalibrationSlider
                    icon={<Activity className="w-5 h-5 text-rose-400" />}
                    label="Stress Load"
                    value={data.stress_level}
                    onChange={(val: number) => updateData({ stress_level: val })}
                    color="bg-rose-500"
                    glow="shadow-[0_0_20px_rgba(244,63,94,0.4)]"
                    descriptions={["None", "Minimal", "Moderate", "High", "Critical"]}
                />

            </div>
        </div>
    );
}

function CalibrationSlider({ icon, label, value, onChange, color, glow, descriptions }: any) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                        {icon}
                    </div>
                    <span className="font-mono text-sm uppercase tracking-wider">{label}</span>
                </div>
                <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
                    LEVEL {value}/5
                </span>
            </div>

            <div className="relative h-12 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl overflow-hidden cursor-pointer group">
                {/* Click Areas */}
                <div className="absolute inset-0 z-20 flex">
                    {[1, 2, 3, 4, 5].map((level) => (
                        <div
                            key={level}
                            className="flex-1 hover:bg-white/5 active:bg-white/10 transition-colors"
                            onClick={() => onChange(level)}
                        />
                    ))}
                </div>

                {/* Fill Bar */}
                <motion.div
                    className={`absolute top-0 left-0 h-full ${color} ${glow}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(value / 5) * 100}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                />

                {/* Grid Lines */}
                <div className="absolute inset-0 flex pointer-events-none">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex-1 border-r border-black/20" />
                    ))}
                </div>
            </div>

            <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)] uppercase font-mono px-1">
                <span>{descriptions[0]}</span>
                <span className="text-white font-bold">{descriptions[value - 1]}</span>
                <span>{descriptions[4]}</span>
            </div>
        </div>
    );
}
