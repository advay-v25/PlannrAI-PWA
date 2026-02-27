// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Sparkles, Play, Clock, CheckCircle, ArrowRight, Brain, Coffee, Calendar } from 'lucide-react';
import type { ScheduleBlock, Goal } from '@/types/database';
import { differenceInMinutes, format } from 'date-fns';
import Link from 'next/link';

interface FocusHeroProps {
    blocks: ScheduleBlock[];
    onCompleteBlock: (id: string) => void;
}

export function FocusHero({ blocks, onCompleteBlock }: FocusHeroProps) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    // 1. Find Current Block
    const currentBlock = blocks.find(b => {
        const start = new Date(`${b.date}T${b.start_time}`);
        const end = new Date(`${b.date}T${b.end_time}`);
        return now >= start && now < end && b.status !== 'done';
    });

    // 2. Find Next Block
    const nextBlock = blocks.find(b => {
        const start = new Date(`${b.date}T${b.start_time}`);
        return start > now && b.status !== 'done';
    });

    // 3. Determine Context
    let context: 'active' | 'gap' | 'done' | 'empty' = 'empty';
    if (currentBlock) context = 'active';
    else if (nextBlock) context = 'gap';
    else if (blocks.length > 0) context = 'done';

    // Helper: Time Formatting
    const timeUntil = (dateStr: string, timeStr: string) => {
        const target = new Date(`${dateStr}T${timeStr}`);
        const diff = differenceInMinutes(target, now);
        if (diff < 60) return `${diff}m`;
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        return `${h}h ${m}m`;
    };

    // Render Logic
    return (
        <div className="relative">
            {/* Background Glow */}
            <div className={`absolute inset-0 bg-gradient-to-r rounded-3xl opacity-20 blur-3xl transition-colors duration-1000 ${context === 'active' ? 'from-[var(--color-primary)] to-[var(--color-future)]' :
                    context === 'gap' ? 'from-[var(--color-success)] to-[var(--color-mind)]' :
                        'from-white/10 to-white/5'
                }`} />

            <GlassCard padding="lg" variant={context === 'active' ? 'glow' : 'deep'} className="relative z-10 min-h-[220px] flex flex-col justify-between overflow-hidden">

                {/* STATE: ACTIVE BLOCK */}
                {context === 'active' && currentBlock && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2 text-[var(--color-primary)]">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-primary)]"></span>
                                </span>
                                <span className="text-xs font-bold uppercase tracking-widest">Now Active</span>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Ends at</p>
                                <p className="font-mono font-bold">{currentBlock.end_time.slice(0, 5)}</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                                {(currentBlock.goal as Goal)?.title || currentBlock.context}
                            </h2>
                            {/* AI Strategy Integration */}
                            {(currentBlock.goal as Goal)?.ai_strategy?.routine?.steps?.[0] ? (
                                <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/10 mt-4">
                                    <Sparkles className="w-5 h-5 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-[var(--color-primary)] font-bold uppercase mb-1">Expert Step</p>
                                        <p className="text-sm">{(currentBlock.goal as Goal).ai_strategy.routine.steps[0]}</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[var(--text-secondary)]">
                                    {(currentBlock.goal as Goal)?.category ? `Focus on your ${(currentBlock.goal as Goal).category} pillar.` : 'Stay focused on the task at hand.'}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-4 pt-2">
                            <GlassButton variant="primary" className="flex-1" onClick={() => onCompleteBlock(currentBlock.id)}>
                                <CheckCircle className="w-5 h-5 mr-2" />
                                Complete Block
                            </GlassButton>
                        </div>
                    </motion.div>
                )}

                {/* STATE: GAP (FREE TIME) */}
                {context === 'gap' && nextBlock && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2 text-[var(--color-success)]">
                                <Coffee className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-widest">Free Time</span>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Next up in</p>
                                <p className="font-mono font-bold">{timeUntil(nextBlock.date, nextBlock.start_time)}</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold tracking-tight mb-2">
                                You have a gap.
                            </h2>
                            <p className="text-[var(--text-secondary)]">
                                Your next block <span className="text-white font-medium">"{nextBlock.context || (nextBlock.goal as Goal)?.title}"</span> starts at {nextBlock.start_time.slice(0, 5)}.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <Link href="/app/brain-dump" className="block">
                                <div className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 flex items-center gap-3">
                                    <Brain className="w-5 h-5 text-[var(--color-mind)]" />
                                    <div className="text-left">
                                        <p className="text-sm font-bold">Clear Mind</p>
                                        <p className="text-[10px] text-[var(--text-tertiary)]">Quick brain dump</p>
                                    </div>
                                </div>
                            </Link>
                            <Link href="/app/calendar" className="block">
                                <div className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 flex items-center gap-3">
                                    <Sparkles className="w-5 h-5 text-[var(--color-future)]" />
                                    <div className="text-left">
                                        <p className="text-sm font-bold">Fill Gap</p>
                                        <p className="text-[10px] text-[var(--text-tertiary)]">Add a quick session</p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </motion.div>
                )}

                {/* STATE: DONE FOR DAY */}
                {context === 'done' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center h-full py-6">
                        <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/20 flex items-center justify-center mb-4">
                            <CheckCircle className="w-8 h-8 text-[var(--color-success)]" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">All Caught Up</h2>
                        <p className="text-[var(--text-secondary)] mb-6 max-w-xs">
                            You've completed your scheduled blocks for today. Great work!
                        </p>
                        <Link href="/app/calendar">
                            <GlassButton variant="ghost">
                                Plan Tomorrow <ArrowRight className="w-4 h-4 ml-2" />
                            </GlassButton>
                        </Link>
                    </motion.div>
                )}

                {/* STATE: EMPTY DAY */}
                {context === 'empty' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center h-full py-6">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Calendar className="w-8 h-8 opacity-50" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Your Day is Open</h2>
                        <p className="text-[var(--text-secondary)] mb-6 max-w-xs">
                            No blocks scheduled for today yet. Ready to design your day?
                        </p>
                        <Link href="/app/calendar">
                            <GlassButton variant="primary">
                                <Sparkles className="w-4 h-4 mr-2" />
                                Plan My Day
                            </GlassButton>
                        </Link>
                    </motion.div>
                )}
            </GlassCard>
        </div>
    );
}
