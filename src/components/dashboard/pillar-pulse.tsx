'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Brain, Dumbbell, Briefcase } from 'lucide-react';

interface PillarPulseProps {
    plannedMinutes: { mind: number; body: number; craft: number };
    completedMinutes: { mind: number; body: number; craft: number };
}

export function PillarPulse({ plannedMinutes, completedMinutes }: PillarPulseProps) {
    const pillars = [
        { id: 'mind', label: 'Mind', icon: Brain, color: 'var(--color-mind)' },
        { id: 'body', label: 'Body', icon: Dumbbell, color: 'var(--color-body)' },
        { id: 'craft', label: 'Craft', icon: Briefcase, color: 'var(--color-primary)' }, // Craft uses primary orange
    ] as const;

    const totalPlanned = (plannedMinutes.mind + plannedMinutes.body + plannedMinutes.craft) || 1;

    return (
        <GlassCard className="p-4 border-[var(--glass-border)] bg-[var(--glass-bg)]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                Life Balance
            </h3>

            <div className="flex justify-between items-end gap-2">
                {pillars.map((pillar) => {
                    const planned = plannedMinutes[pillar.id] || 0;
                    const completed = completedMinutes[pillar.id] || 0;
                    const progress = planned > 0 ? (completed / planned) * 100 : 0;
                    // Scale ring size slightly based on importance/planned time, but keep within bounds
                    const relativeScale = Math.max(0.8, Math.min(1.1, (planned / (totalPlanned / 3))));

                    return (
                        <div key={pillar.id} className="flex-1 flex flex-col items-center gap-2">
                            {/* Animated Pulse Ring */}
                            <div className="relative w-14 h-14 flex items-center justify-center">
                                {/* Background Ring */}
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle
                                        cx="28" cy="28" r="22"
                                        fill="none"
                                        stroke="var(--glass-border)"
                                        strokeWidth="3"
                                    />
                                    {/* Progress Ring */}
                                    <motion.circle
                                        cx="28" cy="28" r="22"
                                        fill="none"
                                        stroke={pillar.color}
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        initial={{ strokeDasharray: '0 138' }} // 2 * pi * 22 approx 138
                                        animate={{ strokeDasharray: `${(progress / 100) * 138} 138` }}
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                    />
                                </svg>

                                {/* Icon */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <pillar.icon
                                        className="w-5 h-5 transition-transform hover:scale-110"
                                        style={{ color: pillar.color, opacity: planned > 0 ? 1 : 0.5 }}
                                    />
                                </div>
                            </div>

                            <div className="text-center">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-secondary)]">
                                    {pillar.label}
                                </p>
                                <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
                                    {Math.round(completed)}/{Math.round(planned)}m
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}
