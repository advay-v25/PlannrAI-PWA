'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Play, CheckCircle, Zap, Brain, Battery } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduleBlock, Goal } from '@/types/database';

interface FocusCompassProps {
    blocks: ScheduleBlock[];
    goals: Goal[];
    energyLevel?: number;
    todayProgress: { completed: number; planned: number };
    onCompleteBlock: (id: string) => void;
}

export function FocusCompass({ blocks, energyLevel = 3, todayProgress, onCompleteBlock }: FocusCompassProps) {
    const [currentBlock, setCurrentBlock] = useState<ScheduleBlock | null>(null);
    const [nextBlock, setNextBlock] = useState<ScheduleBlock | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number>(0);

    // Identify Current & Next Block
    useEffect(() => {
        const updateState = () => {
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();

            // Find current block
            const current = blocks.find(b => {
                const [startH, startM] = b.start_time.split(':').map(Number);
                const [endH, endM] = b.end_time.split(':').map(Number);
                const start = startH * 60 + startM;
                const end = endH * 60 + endM;
                return currentTime >= start && currentTime < end && b.status !== 'done';
            });

            // Find next block
            const next = blocks.find(b => {
                const [startH, startM] = b.start_time.split(':').map(Number);
                const start = startH * 60 + startM;
                return start > currentTime && b.status !== 'done';
            });

            setCurrentBlock(current || null);
            setNextBlock(next || null);

            if (current) {
                const [endH, endM] = current.end_time.split(':').map(Number);
                const end = endH * 60 + endM;
                setTimeRemaining(Math.max(0, end - currentTime));
            }
        };

        updateState();
        const interval = setInterval(updateState, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [blocks]);

    const progressPercentage = todayProgress.planned > 0
        ? (todayProgress.completed / todayProgress.planned) * 100
        : 0;

    return (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* 1. The System Eye (Current Focus) */}
            <div className="md:col-span-2 relative">
                <GlassCard className="h-full min-h-[300px] flex flex-col justify-center items-center p-8 relative overflow-hidden border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5">

                    {/* Animated Pulse Background */}
                    <div className="absolute inset-0 bg-gradient-radial from-[var(--color-primary)]/10 to-transparent opacity-50 animate-pulse-slow" />

                    <div className="relative z-10 text-center space-y-4 max-w-md">
                        {currentBlock ? (
                            <>
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10 text-xs font-mono uppercase tracking-widest mb-2"
                                >
                                    <Play className="w-3 h-3 fill-current" />
                                    Active Protocol
                                </motion.div>

                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)]">
                                    {currentBlock.context}
                                </h2>

                                <p className="text-lg text-[var(--text-secondary)] font-medium">
                                    {timeRemaining}m remaining • Ends at {currentBlock.end_time}
                                </p>

                                <button
                                    className="mt-6 px-8 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold tracking-wide shadow-[0_0_30px_rgba(255,77,0,0.4)] hover:shadow-[0_0_50px_rgba(255,77,0,0.6)] hover:scale-105 transition-all flex items-center gap-2 mx-auto"
                                    onClick={() => onCompleteBlock && onCompleteBlock(currentBlock.id)}
                                >
                                    <CheckCircle className="w-5 h-5" />
                                    Complete Block
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="w-20 h-20 rounded-full border-2 border-[var(--text-tertiary)] flex items-center justify-center mx-auto mb-4 opacity-50">
                                    <Brain className="w-8 h-8 text-[var(--text-secondary)]" />
                                </div>
                                <h2 className="text-2xl font-bold text-[var(--text-secondary)]">System Idle</h2>
                                <p className="text-[var(--text-tertiary)]">Waiting for next scheduled block...</p>
                                {nextBlock && (
                                    <div className="mt-4 px-4 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] inline-block">
                                        <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">Next Up: </span>
                                        <span className="text-[var(--text-primary)] font-semibold">{nextBlock.context}</span>
                                        <span className="text-[var(--text-tertiary)] ml-2">({nextBlock.start_time})</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </GlassCard>
            </div>

            {/* 2. System Vitals (Energy & Progress) */}
            <div className="space-y-4">

                {/* Energy Monitor */}
                <GlassCard className="p-6 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-3 left-4 flex items-center gap-2">
                        <Battery className="w-4 h-4 text-[var(--color-body)]" />
                        <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Energy</span>
                    </div>

                    {/* Ring Chart Placeholder (We can implement CircularProgress properly next) */}
                    <div className="relative w-32 h-32 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="56" stroke="var(--glass-border)" strokeWidth="8" fill="transparent" />
                            <circle
                                cx="64" cy="64" r="56"
                                stroke={energyLevel > 2 ? "var(--color-body)" : "var(--color-warning)"}
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={351}
                                strokeDashoffset={351 - (351 * (energyLevel / 5))}
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold text-[var(--text-primary)]">{energyLevel}/5</span>
                        </div>
                    </div>
                </GlassCard>

                {/* Day Completion */}
                <GlassCard className="p-6 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-3 left-4 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-[var(--color-mind)]" />
                        <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Completion</span>
                    </div>

                    <div className="w-full mt-4 space-y-2">
                        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                            <span>{Math.round(todayProgress.completed)}m Done</span>
                            <span>{Math.round(todayProgress.planned)}m Planned</span>
                        </div>
                        <div className="h-2 w-full bg-[var(--glass-bg)] rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-[var(--color-mind)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, progressPercentage)}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                    </div>
                </GlassCard>

            </div>
        </section>
    );
}
