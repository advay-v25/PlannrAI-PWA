
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ArrowRight, Check, ListChecks, Zap, AlertCircle } from 'lucide-react';
import { useBrainDump } from '@/hooks/use-brain-dump';
import { cn } from '@/lib/utils';
import { OptionCard } from '@/components/coach/option-card';

export default function BrainDumpPage() {
    const { input, setInput, submitDump, isLoading, isApplying, response, applyOption, reset } = useBrainDump();
    const [appliedId, setAppliedId] = useState<string | null>(null);

    const handleApply = async (id: string) => {
        await applyOption(id);
        setAppliedId(id);
    };

    return (
        <div className="flex h-full flex-col p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <header className="space-y-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[var(--color-mind)]/10 text-[var(--color-mind)] border border-[var(--color-mind)]/20">
                        <Brain className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Brain Dump</h1>
                        <p className="text-sm text-[var(--text-secondary)]">Unload your mind. I'll turn chaos into action.</p>
                    </div>
                </div>
            </header>

            {/* Input Area (Only if no response yet) */}
            {!response && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full"
                >
                    <div className="relative group">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="I'm overwhelmed, missed user interviews, need to prep extensively for tomorrow..."
                            className="w-full h-48 p-6 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-lg placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:border-[var(--color-mind)]/50 focus:ring-1 focus:ring-[var(--color-mind)]/20 transition-all shadow-xl"
                            disabled={isLoading}
                        />
                        <div className="absolute bottom-4 right-4 text-xs text-[var(--text-tertiary)]">
                            {input.length} chars
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={submitDump}
                            disabled={!input.trim() || isLoading}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-lg hover:shadow-[var(--color-mind)]/20 disabled:opacity-50 disabled:cursor-not-allowed",
                                isLoading
                                    ? "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] cursor-wait"
                                    : "bg-[var(--color-mind)] text-white hover:bg-[var(--color-mind-hover)]"
                            )}
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    Analyzing Chaos...
                                </>
                            ) : (
                                <>
                                    Transform
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Results Area */}
            <AnimatePresence>
                {response && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                        {/* Left: Extraction Summary */}
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                <h3 className="text-sm font-medium text-[var(--text-secondary)] flex items-center gap-2 mb-3">
                                    <ListChecks className="w-4 h-4" />
                                    Extracted Items
                                </h3>
                                <ul className="space-y-2">
                                    {response.extracted.items.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm p-2 rounded-lg hover:bg-[var(--glass-bg-hover)]">
                                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-mind)]" />
                                            <span className="flex-1 text-[var(--text-primary)]">{item.title}</span>
                                            {item.est_min && (
                                                <span className="text-[10px] text-[var(--text-tertiary)] border border-[var(--glass-border)] px-1.5 py-0.5 rounded">
                                                    {item.est_min}m
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                    {response.extracted.items.length === 0 && (
                                        <li className="text-sm text-[var(--text-tertiary)] italic">No explicit tasks found.</li>
                                    )}
                                </ul>
                            </div>

                            {/* Signals */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex flex-col items-center justify-center">
                                    <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Energy</span>
                                    <div className="mt-1 flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map(l => (
                                            <div key={l} className={cn(
                                                "w-1.5 h-6 rounded-full transition-all",
                                                l <= (response.extracted.signals?.energy ?? 0)
                                                    ? "bg-[var(--color-mind)]"
                                                    : "bg-[var(--glass-border)]"
                                            )} />
                                        ))}
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex flex-col items-center justify-center">
                                    <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Overwhelm</span>
                                    <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                                        {Math.round((response.extracted.signals?.overwhelm ?? 0) * 100)}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Action Options */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-[var(--text-secondary)] flex items-center gap-2">
                                <Zap className="w-4 h-4 text-[var(--color-primary)]" />
                                Immediate Actions
                            </h3>

                            <div className="space-y-3">
                                {(response.options ?? []).map((opt) => (
                                    <div key={opt.id}> {/* Wrapper because OptionCard handles apply internally but we need parent state too */}
                                        <OptionCard
                                            option={{ ...opt, patch: opt.patch }}
                                            onApply={() => handleApply(opt.id)}
                                            isApplying={isApplying && appliedId === opt.id} // Simplistic loading logic
                                            isApplied={appliedId === opt.id}
                                            disabled={!!appliedId} // Disable all if one applied
                                        />
                                    </div>
                                ))}
                            </div>

                            {appliedId && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-3"
                                >
                                    <Check className="w-5 h-5" />
                                    <span>Changes applied to your reality.</span>
                                    <button onClick={reset} className="ml-auto underline hover:text-green-300">New Dump</button>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
