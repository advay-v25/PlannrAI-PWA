'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Play, MoreHorizontal, Check, RefreshCw, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface StacksModuleProps {
    stacks: any[]; // HabitStack type
    onUpdate: () => void;
}

export function StacksModule({ stacks, onUpdate }: StacksModuleProps) {
    const [activeStackId, setActiveStackId] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);

    // AI Logic (Placeholder for now, but wired)
    const handleOptimize = async () => {
        setGenerating(true);
        const promise = fetch('/api/habit-stacks/assist', { method: 'POST', body: JSON.stringify({ mode: 'optimize' }) })
            .then(r => r.json());

        toast.promise(promise, {
            loading: 'Optimizing routines...',
            success: (data) => {
                setGenerating(false);
                onUpdate();
                return "Routines optimized based on your energy.";
            },
            error: "Failed to optimize."
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
                    className="mt-4 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] hover:underline"
                >
                    Create one with AI
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
                    {generating ? 'Optimizing...' : 'Optimize'}
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

    // Determine gradient based on time_of_day or type (inferred)
    const isMorning = (stack.name?.toLowerCase() || '').includes('morning') || stack.preferred_window === 'morning';
    const gradient = isMorning
        ? "from-orange-500/10 to-amber-500/5"
        : "from-indigo-500/10 to-purple-500/5";

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
                        <h4 className="text-lg font-medium text-white">{stack.name}</h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                            <ClockIcon />
                            <span>{stack.total_duration || 30} mins</span>
                            <span>•</span>
                            <span>{stack.steps?.length || 0} steps</span>
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
                            {(stack.steps || []).map((step: any, i: number) => (
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
