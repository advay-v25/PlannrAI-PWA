'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Play, MoreHorizontal, Check, RefreshCw, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';

interface StacksModuleProps {
    stacks: any[]; // HabitStack type
    onUpdate: () => void;
}

export function StacksModule({ stacks, onUpdate }: StacksModuleProps) {
    const [generating, setGenerating] = useState(false);

    const handleOptimize = async () => {
        setGenerating(true);
        const promise = (async () => {
            // 1. Get AI Proposal
            const res = await fetch('/api/habit-stacks/assist', {
                method: 'POST',
                body: JSON.stringify({ mode: 'build' })
            }).then(r => r.json());

            if (res.error) throw new Error(res.error);

            // 2. Check for Patch
            const options = res.data?.options;
            if (options && options.length > 0 && options[0].patch) {
                // Auto-apply the first option for "Build Mode"
                await apiClient.patch.apply(options[0].patch, 'habit_build_ai');
            }

            // 3. Refresh
            onUpdate();
            return "New routine constructed.";
        })();

        toast.promise(promise, {
            loading: 'Architecting routine...',
            success: (data) => {
                setGenerating(false);
                return data;
            },
            error: "Failed to build routine."
        });
    };

    if (!stacks || stacks.length === 0) {
        return (
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                    <Layers className="h-5 w-5 text-white/40" />
                </div>
                <h3 className="text-sm font-medium text-white">No active routines</h3>
                <button
                    onClick={handleOptimize}
                    disabled={generating}
                    className="mt-4 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] hover:underline disabled:opacity-50"
                >
                    {generating ? 'Building...' : 'Create one with AI'}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Stacks</h3>
                <button
                    onClick={handleOptimize}
                    disabled={generating}
                    className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <Sparkles className="h-3 w-3" />
                    {generating ? 'Thinking...' : 'Add Stack'}
                </button>
            </div>

            <div className="grid gap-4">
                {stacks.map(stack => (
                    <StackCard key={stack.id} stack={stack} />
                ))}
            </div>
        </div>
    );
}

function StackCard({ stack }: { stack: any }) {
    const [expanded, setExpanded] = useState(false);

    // Normalize Steps (Fallback for DB Schema mismatch)
    const steps = stack.steps || [];
    if (steps.length === 0) {
        if (stack.trigger_habit) steps.push({ title: stack.trigger_habit, minutes: 0 });
        if (stack.action_habit) steps.push({ title: stack.action_habit, minutes: stack.action_duration_mins || 2 });
    }

    // Determine gradient based on time_of_day or type (inferred)
    const isMorning = (stack.name?.toLowerCase() || '').includes('morning') || stack.preferred_window === 'morning' || stack.time_of_day === 'morning';
    const gradient = isMorning
        ? "from-orange-500/10 to-amber-500/5"
        : "from-indigo-500/10 to-purple-500/5";

    // Name fallback
    const displayName = stack.name || (stack.trigger_habit ? `After ${stack.trigger_habit}...` : 'New Routine');

    return (
        <motion.div
            layout
            className={cn(
                "relative overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-br p-1 transition-all",
                gradient,
                expanded ? "bg-white/10" : "bg-white/5"
            )}
        >
            <div className="relative z-10 flex flex-col p-5">
                <div className="flex items-start justify-between">
                    <div>
                        <h4 className="text-lg font-medium text-white">{displayName}</h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                            <ClockIcon />
                            <span>{stack.total_duration || stack.action_duration_mins || 5} mins</span>
                            <span>•</span>
                            <span>{steps.length} steps</span>
                        </div>
                    </div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="rounded-full bg-white/10 p-2 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
                    >
                        {expanded ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                </div>

                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 space-y-2 border-t border-white/10 pt-4"
                        >
                            {steps.map((step: any, i: number) => (
                                <div key={i} className="flex items-center gap-3 rounded-xl bg-black/20 p-3">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20">
                                        <div className="h-3 w-3 rounded-full bg-white/0 transition-colors hover:bg-white/50" />
                                    </div>
                                    <span className="text-sm text-white/80">{step.title}</span>
                                    <span className="ml-auto text-xs text-white/30">{step.minutes}m</span>
                                </div>
                            ))}
                            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-white text-black py-3 text-sm font-bold">
                                Start Session
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

function ClockIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
}
