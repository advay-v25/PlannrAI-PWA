'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import {
    Sparkles, Play, Clock, CheckCircle, ArrowRight, Brain, Coffee,
    Calendar, Sun, Moon, Zap, Target, TrendingUp, ListChecks
} from 'lucide-react';
import type { ScheduleBlock, Goal } from '@/types/database';
import { differenceInMinutes, format } from 'date-fns';
import Link from 'next/link';

type ContextMode = 'morning' | 'active' | 'gap' | 'evening' | 'empty';

interface FocusCompassProps {
    blocks: ScheduleBlock[];
    goals: Goal[];
    energyLevel?: number;
    todayProgress: { completed: number; planned: number };
    onCompleteBlock: (id: string) => void;
}

export function FocusCompass({
    blocks,
    goals,
    energyLevel = 3,
    todayProgress,
    onCompleteBlock
}: FocusCompassProps) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000); // Update every 30s
        return () => clearInterval(timer);
    }, []);

    // Determine context
    const hour = now.getHours();

    // Find current block
    const currentBlock = blocks.find(b => {
        const start = new Date(`${b.date}T${b.start_time}`);
        const end = new Date(`${b.date}T${b.end_time}`);
        return now >= start && now < end && b.status !== 'done';
    });

    // Find next block
    const nextBlock = blocks.find(b => {
        const start = new Date(`${b.date}T${b.start_time}`);
        return start > now && b.status !== 'done';
    });

    // Calculate gap duration
    const gapMinutes = nextBlock
        ? differenceInMinutes(new Date(`${nextBlock.date}T${nextBlock.start_time}`), now)
        : null;

    // Determine mode
    let mode: ContextMode = 'empty';
    if (currentBlock) {
        mode = 'active';
    } else if (hour >= 5 && hour < 10 && blocks.length > 0) {
        mode = 'morning';
    } else if (hour >= 20 || blocks.filter(b => b.status !== 'done').length === 0) {
        mode = 'evening';
    } else if (nextBlock) {
        mode = 'gap';
    }

    // Find goals needing attention (have strategy but no scheduled block today)
    const unscheduledGoalsWithStrategy = goals.filter(g =>
        g.ai_strategy && !blocks.some(b => b.goal_id === g.id)
    );

    // Time formatting
    const formatGap = (mins: number) => {
        if (mins < 60) return `${mins}m`;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    return (
        <div className="relative">
            <AnimatePresence mode="wait">
                {/* MORNING BRIEFING */}
                {mode === 'morning' && (
                    <motion.div
                        key="morning"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <GlassCard padding="lg" variant="glow" className="relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/20 to-yellow-500/10 rounded-full blur-3xl" />

                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/30 to-yellow-500/20 flex items-center justify-center">
                                            <Sun className="w-6 h-6 text-orange-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest">Morning Briefing</p>
                                            <h2 className="text-2xl font-bold">Ready to Win Today?</h2>
                                        </div>
                                    </div>
                                </div>

                                {/* Today's Stats Preview */}
                                <div className="grid grid-cols-3 gap-4 p-4 bg-white/5 rounded-2xl">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold">{blocks.length}</p>
                                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Blocks</p>
                                    </div>
                                    <div className="text-center border-x border-white/10">
                                        <p className="text-2xl font-bold">{todayProgress.planned}m</p>
                                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Planned</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold">{goals.length}</p>
                                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Active Goals</p>
                                    </div>
                                </div>

                                {/* First Block Preview */}
                                {blocks[0] && (
                                    <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/20 flex items-center justify-center">
                                            <Target className="w-5 h-5 text-[var(--color-primary)]" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs text-[var(--text-tertiary)]">First up at {blocks[0].start_time.slice(0, 5)}</p>
                                            <p className="font-medium">{(blocks[0].goal as Goal)?.title || blocks[0].context}</p>
                                        </div>
                                    </div>
                                )}

                                <GlassButton variant="primary" className="w-full" onClick={() => { }}>
                                    <Play className="w-4 h-4 mr-2" />
                                    Start My Day
                                </GlassButton>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}

                {/* ACTIVE FLOW STATE */}
                {mode === 'active' && currentBlock && (
                    <motion.div
                        key="active"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                    >
                        <GlassCard padding="lg" variant="glow" className="relative overflow-hidden border-l-4 border-[var(--color-primary)]">
                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent" />

                            <div className="relative z-10 space-y-6">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-primary)]"></span>
                                        </span>
                                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">In Flow</span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-[var(--text-tertiary)]">Ends at</p>
                                        <p className="font-mono font-bold text-lg">{currentBlock.end_time.slice(0, 5)}</p>
                                    </div>
                                </div>

                                <div>
                                    <h2 className="text-3xl font-bold tracking-tight mb-2">
                                        {(currentBlock.goal as Goal)?.title || currentBlock.context}
                                    </h2>

                                    {/* AI Strategy Step */}
                                    {(currentBlock.goal as Goal)?.ai_strategy?.routine?.steps?.[0] && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex items-start gap-3 p-4 bg-[var(--color-primary)]/10 rounded-xl border border-[var(--color-primary)]/20 mt-4"
                                        >
                                            <Sparkles className="w-5 h-5 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs text-[var(--color-primary)] font-bold uppercase mb-1">Focus On</p>
                                                <p className="text-sm">{(currentBlock.goal as Goal).ai_strategy.routine.steps[0]}</p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Checklist Preview */}
                                    {currentBlock.checklist && currentBlock.checklist.length > 0 && (
                                        <div className="mt-4 p-3 bg-white/5 rounded-xl">
                                            <div className="flex items-center gap-2 mb-2">
                                                <ListChecks className="w-4 h-4 text-[var(--text-tertiary)]" />
                                                <span className="text-xs text-[var(--text-tertiary)]">
                                                    {currentBlock.checklist.filter(c => c.completed).length}/{currentBlock.checklist.length} complete
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-[var(--color-success)]"
                                                    initial={{ width: 0 }}
                                                    animate={{
                                                        width: `${(currentBlock.checklist.filter(c => c.completed).length / currentBlock.checklist.length) * 100}%`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <GlassButton variant="primary" className="w-full" onClick={() => onCompleteBlock(currentBlock.id)}>
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    Complete Session
                                </GlassButton>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}

                {/* GAP / OPPORTUNITY STATE */}
                {mode === 'gap' && nextBlock && (
                    <motion.div
                        key="gap"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <GlassCard padding="lg" className="relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--color-success)]/10 rounded-full blur-2xl" />

                            <div className="relative z-10 space-y-5">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2 text-[var(--color-success)]">
                                        <Coffee className="w-4 h-4" />
                                        <span className="text-xs font-bold uppercase tracking-widest">
                                            {gapMinutes && gapMinutes < 30 ? 'Quick Break' : 'Opportunity Window'}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-[var(--text-tertiary)]">Next in</p>
                                        <p className="font-mono font-bold">{gapMinutes ? formatGap(gapMinutes) : '--'}</p>
                                    </div>
                                </div>

                                <div>
                                    <h2 className="text-2xl font-bold mb-1">
                                        {gapMinutes && gapMinutes >= 30 ? 'Time for a Power Move' : 'Recharge Moment'}
                                    </h2>
                                    <p className="text-[var(--text-secondary)] text-sm">
                                        Next: <span className="font-medium text-white">{(nextBlock.goal as Goal)?.title || nextBlock.context}</span> at {nextBlock.start_time.slice(0, 5)}
                                    </p>
                                </div>

                                {/* Smart Suggestions */}
                                {gapMinutes && gapMinutes >= 30 && unscheduledGoalsWithStrategy.length > 0 && (
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                        <p className="text-xs text-[var(--color-primary)] font-bold uppercase mb-2">Suggested</p>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/20 flex items-center justify-center">
                                                <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium">{unscheduledGoalsWithStrategy[0].title}</p>
                                                <p className="text-xs text-[var(--text-tertiary)]">
                                                    {unscheduledGoalsWithStrategy[0].minutes_per_day}m • {unscheduledGoalsWithStrategy[0].category}
                                                </p>
                                            </div>
                                            <Link href="/app/goals">
                                                <GlassButton variant="ghost" size="sm">
                                                    Start
                                                </GlassButton>
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* Quick Actions */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/app/brain-dump">
                                        <div className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 flex items-center gap-3">
                                            <Brain className="w-5 h-5 text-[var(--color-mind)]" />
                                            <span className="text-sm font-medium">Brain Dump</span>
                                        </div>
                                    </Link>
                                    <Link href="/app/calendar">
                                        <div className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 flex items-center gap-3">
                                            <Calendar className="w-5 h-5 text-[var(--color-future)]" />
                                            <span className="text-sm font-medium">Fill Slot</span>
                                        </div>
                                    </Link>
                                </div>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}

                {/* EVENING RETROSPECTIVE */}
                {mode === 'evening' && (
                    <motion.div
                        key="evening"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <GlassCard padding="lg" className="relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 rounded-full blur-3xl" />

                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/30 to-indigo-500/20 flex items-center justify-center">
                                        <Moon className="w-6 h-6 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest">Day Complete</p>
                                        <h2 className="text-2xl font-bold">Time to Wind Down</h2>
                                    </div>
                                </div>

                                {/* Today's Summary */}
                                <div className="p-4 bg-white/5 rounded-2xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-[var(--text-secondary)]">Today's Progress</span>
                                        <span className="text-sm font-bold text-[var(--color-success)]">
                                            {todayProgress.planned > 0
                                                ? Math.round((todayProgress.completed / todayProgress.planned) * 100)
                                                : 0}%
                                        </span>
                                    </div>
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-success)]"
                                            initial={{ width: 0 }}
                                            animate={{
                                                width: `${todayProgress.planned > 0 ? (todayProgress.completed / todayProgress.planned) * 100 : 0}%`
                                            }}
                                            transition={{ duration: 1, delay: 0.3 }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs text-[var(--text-tertiary)]">
                                        <span>{blocks.filter(b => b.status === 'done').length} blocks completed</span>
                                        <span>{todayProgress.completed}m focused</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/app/weekly-review">
                                        <GlassButton variant="ghost" className="w-full">
                                            <TrendingUp className="w-4 h-4 mr-2" />
                                            Weekly Review
                                        </GlassButton>
                                    </Link>
                                    <Link href="/app/calendar">
                                        <GlassButton variant="primary" className="w-full">
                                            Plan Tomorrow
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        </GlassButton>
                                    </Link>
                                </div>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}

                {/* EMPTY STATE */}
                {mode === 'empty' && (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <GlassCard padding="lg" className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                                <Calendar className="w-8 h-8 text-[var(--text-tertiary)]" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Your Day is Open</h2>
                            <p className="text-[var(--text-secondary)] mb-6 max-w-xs mx-auto">
                                No blocks scheduled. Ready to design your day?
                            </p>
                            <Link href="/app/calendar">
                                <GlassButton variant="primary">
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Plan My Day
                                </GlassButton>
                            </Link>
                        </GlassCard>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
