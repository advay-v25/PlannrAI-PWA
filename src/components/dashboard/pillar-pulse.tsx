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
        { id: 'mind', label: 'Mind', icon: Brain, color: 'var(--color-mind)', soft: 'var(--color-mind-soft)' },
        { id: 'body', label: 'Body', icon: Dumbbell, color: 'var(--color-body)', soft: 'var(--color-body-soft)' },
        { id: 'craft', label: 'Craft', icon: Briefcase, color: 'var(--color-craft)', soft: 'var(--color-craft-soft)' },
    ] as const;

    const totalPlanned = plannedMinutes.mind + plannedMinutes.body + plannedMinutes.craft || 1;

    return (
        <GlassCard padding="md">
            <h3 className="text-sm font-medium mb-4">Life Balance Pulse</h3>
            <div className="flex justify-between gap-2">
                {pillars.map((pillar) => {
                    const planned = plannedMinutes[pillar.id] || 0;
                    const completed = completedMinutes[pillar.id] || 0;
                    const progress = planned > 0 ? (completed / planned) * 100 : 0;
                    const relativeSize = Math.max(0.6, Math.min(1.2, (planned / (totalPlanned / 3))));

                    return (
                        <div key={pillar.id} className="flex-1 flex flex-col items-center">
                            {/* Mini Pulse Ring */}
                            <div className="relative w-12 h-12 mb-2" style={{ transform: `scale(${relativeSize})` }}>
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle
                                        cx="24" cy="24" r="20"
                                        fill="none"
                                        stroke="white"
                                        strokeOpacity="0.1"
                                        strokeWidth="4"
                                    />
                                    <motion.circle
                                        cx="24" cy="24" r="20"
                                        fill="none"
                                        stroke={pillar.color}
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        initial={{ strokeDasharray: '0 126' }}
                                        animate={{ strokeDasharray: `${(progress / 100) * 126} 126` }}
                                        transition={{ duration: 1 }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <pillar.icon className="w-4 h-4" style={{ color: pillar.color }} />
                                </div>
                            </div>

                            <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-secondary)]">
                                {pillar.label}
                            </p>
                            <p className="text-xs font-mono text-[var(--text-tertiary)] mt-0.5">
                                {Math.round(completed)}/{Math.round(planned)}m
                            </p>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}
