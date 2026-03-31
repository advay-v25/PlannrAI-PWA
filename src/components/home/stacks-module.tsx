'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Play, Check, RefreshCw, Layers, Timer, ChevronDown, ChevronUp, Trash2, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface StacksModuleProps {
    stacks: any[];
    onUpdate: () => void;
}

export function StacksModule({ stacks, onUpdate }: StacksModuleProps) {
    const [generating, setGenerating] = useState(false);

    const handleOptimize = async () => {
        setGenerating(true);
        try {
            const res = await fetch('/api/habit-stacks/assist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'build' })
            }).then(r => r.json());

            if (res.error) throw new Error(res.error);
            onUpdate();
            toast.success(res.data?.donna_note || "New routine created!");
        } catch (e: any) {
            toast.error("Failed to build routine. Try again.");
        } finally {
            setGenerating(false);
        }
    };

    const handleDeleteStack = useCallback(async (stackId: string) => {
        try {
            const res = await fetch('/api/habit-stacks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: stackId })
            });
            if (!res.ok) throw new Error('Delete failed');
            toast.success("Stack removed");
            onUpdate();
        } catch (e) {
            toast.error("Failed to delete stack");
        }
    }, [onUpdate]);

    const handleCompleteStack = useCallback(async (stackId: string) => {
        try {
            const res = await fetch('/api/habit-stacks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: stackId, mark_complete: true })
            });
            if (!res.ok) throw new Error('Completion failed');
            onUpdate();
            toast.success("Stack completed! 🔥");
        } catch (e) {
            toast.error("Failed to record completion");
        }
    }, [onUpdate]);

    if (!stacks || stacks.length === 0) {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                    <Layers className="h-5 w-5 text-white/40" />
                </div>
                <h3 className="text-sm font-medium text-white">No active routines</h3>
                <p className="text-xs text-white/40 mt-1">AI will build goal-aligned habit stacks for you</p>
                <button
                    onClick={handleOptimize}
                    disabled={generating}
                    className="mt-4 flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-full
                        bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20
                        text-sm font-bold text-[var(--color-primary)]
                        hover:bg-[var(--color-primary)]/20 disabled:opacity-50 transition-all"
                >
                    {generating ? (
                        <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Building...</>
                    ) : (
                        <><Sparkles className="h-3.5 w-3.5" /> Create with AI</>
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Stacks</h3>
                <button
                    onClick={handleOptimize}
                    disabled={generating}
                    className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <Sparkles className="h-3 w-3" />
                    {generating ? 'Thinking...' : 'Create with AI'}
                </button>
            </div>

            <div className="grid gap-3">
                {stacks.map(stack => (
                    <StackCard
                        key={stack.id}
                        stack={stack}
                        onComplete={handleCompleteStack}
                        onDelete={handleDeleteStack}
                    />
                ))}
            </div>
        </div>
    );
}

function StackCard({ stack, onComplete, onDelete }: {
    stack: any;
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [sessionActive, setSessionActive] = useState(false);

    // Normalize steps
    const steps = stack.steps || [];
    if (steps.length === 0) {
        if (stack.trigger_habit) steps.push({ title: stack.trigger_habit, minutes: 0 });
        if (stack.action_habit) steps.push({ title: stack.action_habit, minutes: stack.action_duration_mins || 2 });
    }

    const allStepsDone = steps.length > 0 && completedSteps.size === steps.length;
    const streak = stack.current_streak || 0;

    // Gradient based on time
    const isMorning = (stack.name?.toLowerCase() || '').includes('morning') || stack.preferred_window === 'morning' || stack.time_of_day === 'morning';
    const isEvening = (stack.name?.toLowerCase() || '').includes('evening') || stack.preferred_window === 'evening' || stack.time_of_day === 'evening';
    const gradient = isMorning
        ? "from-orange-500/10 to-amber-500/5"
        : isEvening
            ? "from-violet-500/10 to-indigo-500/5"
            : "from-cyan-500/10 to-teal-500/5";

    const rawTrigger = stack.trigger_habit || '';
    const cleanTrigger = rawTrigger.toLowerCase().startsWith('after ') ? rawTrigger.slice(6) : rawTrigger;
    const displayName = stack.name || (cleanTrigger ? `After ${cleanTrigger}...` : 'New Routine');
    const totalMinutes = stack.total_duration || stack.action_duration_mins || steps.reduce((sum: number, s: any) => sum + (s.minutes || 0), 0) || 5;

    const toggleStep = (idx: number) => {
        setCompletedSteps(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const handleStartSession = () => {
        setSessionActive(true);
        setExpanded(true);
        setCompletedSteps(new Set());
    };

    const handleFinishSession = () => {
        onComplete(stack.id);
        setSessionActive(false);
        setCompletedSteps(new Set());
    };

    return (
        <motion.div
            layout
            className={cn(
                "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-1 transition-all",
                allStepsDone ? "border-[var(--color-success)]/30" : "border-white/5",
                gradient,
                expanded ? "bg-white/10" : "bg-white/5"
            )}
        >
            <div className="relative z-10 flex flex-col p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h4 className="text-base font-medium text-white truncate">{displayName}</h4>
                            {streak > 0 && (
                                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                                    <Flame className="h-2.5 w-2.5 text-orange-400" />
                                    <span className="text-[10px] font-bold text-orange-400">{streak}</span>
                                </div>
                            )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/40">
                            <Timer className="h-3 w-3" />
                            <span>{totalMinutes}m</span>
                            <span>•</span>
                            <span>{steps.length} steps</span>
                            {sessionActive && (
                                <>
                                    <span>•</span>
                                    <span className="text-[var(--color-primary)] font-bold">{completedSteps.size}/{steps.length} done</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {!sessionActive ? (
                            <button
                                onClick={handleStartSession}
                                className="rounded-full bg-white/10 p-2 text-white/60 transition-all hover:bg-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
                                title="Start Session"
                            >
                                <Play className="h-4 w-4" />
                            </button>
                        ) : (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="rounded-full bg-white/10 p-2 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
                            >
                                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                        )}
                    </div>
                </div>

                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 space-y-2 border-t border-white/10 pt-3"
                        >
                            {steps.map((step: any, i: number) => {
                                const done = completedSteps.has(i);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => sessionActive && toggleStep(i)}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all",
                                            sessionActive ? "cursor-pointer" : "cursor-default",
                                            done ? "bg-[var(--color-success)]/5 border border-[var(--color-success)]/20" : "bg-black/20"
                                        )}
                                    >
                                        <div className={cn(
                                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all",
                                            done ? "border-[var(--color-success)] bg-[var(--color-success)]" : "border-white/20"
                                        )}>
                                            {done && <Check className="h-3 w-3 text-white" />}
                                        </div>
                                        <span className={cn(
                                            "text-sm flex-1",
                                            done ? "text-white/60 line-through" : "text-white/80"
                                        )}>{step.title}</span>
                                        <span className="text-xs text-white/30">{step.minutes}m</span>
                                    </button>
                                );
                            })}

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-1">
                                {sessionActive && allStepsDone ? (
                                    <button
                                        onClick={handleFinishSession}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-success)] text-white py-3 text-sm font-bold
                                            hover:brightness-110 active:scale-[0.98] transition-all"
                                    >
                                        <Check className="h-4 w-4" /> Complete Stack 🎉
                                    </button>
                                ) : sessionActive ? (
                                    <button
                                        onClick={() => { setSessionActive(false); setCompletedSteps(new Set()); }}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 text-white/60 py-3 text-sm
                                            hover:bg-white/10 transition-all"
                                    >
                                        Cancel Session
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleStartSession}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white text-black py-3 text-sm font-bold
                                                hover:brightness-95 active:scale-[0.98] transition-all"
                                        >
                                            <Play className="h-4 w-4" /> Start Session
                                        </button>
                                        <button
                                            onClick={() => onDelete(stack.id)}
                                            className="rounded-xl bg-white/5 border border-white/10 p-3 text-white/30 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
                                            title="Delete Stack"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
