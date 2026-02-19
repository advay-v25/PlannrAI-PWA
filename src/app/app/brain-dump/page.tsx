'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Loader2, RotateCcw, Sparkles, AlertTriangle, Heart, Zap, Clock, Flame, CheckCircle2, MessageCircle, ArrowRight, FileText } from 'lucide-react';
import { useBrainDump } from '@/hooks/use-brain-dump';
import { OptionCard } from '@/components/coach/option-card';

const KIND_ICONS: Record<string, React.ReactNode> = {
    task: <CheckCircle2 className="w-3 h-3 text-[var(--color-primary)]" />,
    commitment: <Clock className="w-3 h-3 text-[var(--color-anchor)]" />,
    worry: <AlertTriangle className="w-3 h-3 text-[var(--color-warning)]" />,
    idea: <Sparkles className="w-3 h-3 text-[var(--color-mind)]" />,
    note: <FileText className="w-3 h-3 text-[var(--text-tertiary)]" />,
    habit: <Flame className="w-3 h-3 text-[var(--color-body)]" />,
    constraint: <Clock className="w-3 h-3 text-[var(--color-error)]" />,
};

const KIND_COLORS: Record<string, string> = {
    task: 'var(--color-primary)',
    commitment: 'var(--color-anchor)',
    worry: 'var(--color-warning)',
    idea: 'var(--color-mind)',
    note: 'var(--text-tertiary)',
    habit: 'var(--color-body)',
    constraint: 'var(--color-error)',
};

export default function BrainDumpPage() {
    const {
        input, isLoading, isApplying, response,
        extractedItems, constraints, signals, options, question,
        appliedOptionId, lastUndoToken, error,
        setInput, submitDump, applyOption, undoLastAction, reset
    } = useBrainDump();

    const hasResults = response !== null;

    return (
        <div className="space-y-6 pt-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-mind)]/10 flex items-center justify-center border border-[var(--color-mind)]/20">
                        <Brain className="w-5 h-5 text-[var(--color-mind)]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Brain Dump</h1>
                        <p className="text-xs text-[var(--text-tertiary)]">Unload. I'll extract signals and propose actions.</p>
                    </div>
                </div>
                {hasResults && (
                    <button
                        onClick={reset}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            bg-[var(--glass-bg)] border border-[var(--glass-border)]
                            hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] transition-all"
                    >
                        <Brain className="w-3 h-3" />
                        New Dump
                    </button>
                )}
            </div>

            {/* Input */}
            {!hasResults && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                >
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="What's on your mind? Tasks, feelings, constraints, ideas — dump it all..."
                        className="w-full h-40 p-4 text-sm font-normal leading-relaxed text-[var(--text-primary)]
                            bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl
                            placeholder:text-[var(--text-tertiary)]
                            focus:border-[var(--color-mind)]/30 focus:ring-1 focus:ring-[var(--color-mind)]/10
                            outline-none resize-none transition-all"
                        disabled={isLoading}
                    />
                    <button
                        onClick={submitDump}
                        disabled={!input.trim() || isLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                            bg-gradient-to-r from-[var(--color-mind)] to-[var(--color-primary)]
                            text-white shadow-lg shadow-[var(--color-mind)]/20
                            disabled:opacity-30 disabled:cursor-not-allowed
                            hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Process Dump
                            </>
                        )}
                    </button>
                </motion.div>
            )}

            {/* Error */}
            {error && (
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-[var(--color-error)]/5 border border-[var(--color-error)]/10"
                >
                    <p className="text-xs text-[var(--color-error)]">{error}</p>
                </motion.div>
            )}

            {/* Results */}
            {hasResults && (
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-5"
                    >
                        {/* Summary */}
                        {response?.summary && (
                            <div className="p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                <p className="text-sm text-[var(--text-primary)] font-medium">{response.summary}</p>
                            </div>
                        )}

                        {/* Signals */}
                        {signals && (
                            <div className="flex flex-wrap gap-2">
                                {signals.energy != null && (
                                    <SignalBadge
                                        icon={<Zap className="w-3 h-3" />}
                                        label="Energy"
                                        value={`${signals.energy}/5`}
                                        color={signals.energy <= 2 ? 'var(--color-error)' : signals.energy >= 4 ? 'var(--color-success)' : 'var(--color-warning)'}
                                    />
                                )}
                                {signals.overwhelm != null && signals.overwhelm > 0.3 && (
                                    <SignalBadge
                                        icon={<AlertTriangle className="w-3 h-3" />}
                                        label="Overwhelm"
                                        value={`${Math.round(signals.overwhelm * 100)}%`}
                                        color="var(--color-error)"
                                    />
                                )}
                                {signals.stress != null && signals.stress > 0.3 && (
                                    <SignalBadge
                                        icon={<Flame className="w-3 h-3" />}
                                        label="Stress"
                                        value={`${Math.round(signals.stress * 100)}%`}
                                        color="var(--color-warning)"
                                    />
                                )}
                                {signals.motivation != null && signals.motivation > 0.5 && (
                                    <SignalBadge
                                        icon={<Heart className="w-3 h-3" />}
                                        label="Motivation"
                                        value={`${Math.round(signals.motivation * 100)}%`}
                                        color="var(--color-success)"
                                    />
                                )}
                                {signals.health_flag && (
                                    <SignalBadge
                                        icon={<Heart className="w-3 h-3" />}
                                        label="Health"
                                        value={signals.health_flag}
                                        color="var(--color-error)"
                                    />
                                )}
                            </div>
                        )}

                        {/* Extracted Items */}
                        {extractedItems.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                    Extracted ({extractedItems.length})
                                </h3>
                                <div className="space-y-1.5">
                                    {extractedItems.map((item, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                                        >
                                            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: `${KIND_COLORS[item.kind] || 'var(--text-tertiary)'}10` }}>
                                                {KIND_ICONS[item.kind] || <FileText className="w-3 h-3" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">{item.kind}</span>
                                                    {item.est_min && (
                                                        <span className="text-[10px] text-[var(--text-tertiary)]">{item.est_min}m</span>
                                                    )}
                                                    {item.urgency && item.urgency >= 4 && (
                                                        <span className="text-[10px] text-[var(--color-error)] font-medium">Urgent</span>
                                                    )}
                                                    {item.pillar && (
                                                        <span className="text-[10px] text-[var(--text-tertiary)]">{item.pillar}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Constraints */}
                        {constraints.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                    Constraints  ({constraints.length})
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {constraints.map((c, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                                                bg-[var(--color-error)]/5 border border-[var(--color-error)]/10 text-[var(--color-error)]"
                                        >
                                            <Clock className="w-3 h-3" />
                                            {c.description}
                                            {c.start_time && c.end_time && (
                                                <span className="opacity-70">({c.start_time}–{c.end_time})</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Question (ask mode) */}
                        {question && (
                            <div className="p-4 rounded-2xl bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/10 space-y-3">
                                <div className="flex items-center gap-1.5">
                                    <MessageCircle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                                    <span className="text-xs font-semibold text-[var(--color-warning)] uppercase tracking-wider">Clarification Needed</span>
                                </div>
                                <p className="text-sm text-[var(--text-primary)]">{question.prompt}</p>
                                {question.choices && (
                                    <div className="flex flex-wrap gap-2">
                                        {question.choices.map(c => (
                                            <button key={c} onClick={() => {
                                                setInput(c);
                                                reset();
                                            }}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all"
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Options */}
                        {options.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                    Actions
                                </h3>
                                <div className="space-y-2">
                                    {options.map((option) => (
                                        <OptionCard
                                            key={option.id}
                                            option={option}
                                            isApplying={isApplying}
                                            isApplied={appliedOptionId === option.id}
                                            onApply={() => applyOption(option.id)}
                                        />
                                    ))}
                                </div>

                                {/* Undo */}
                                {lastUndoToken && appliedOptionId && (
                                    <button
                                        onClick={undoLastAction}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                                            bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                            hover:bg-[var(--glass-bg-hover)] transition-all"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Undo Applied Changes
                                    </button>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
}

// --- Signal Badge ---
function SignalBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    return (
        <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{
                backgroundColor: `${color}08`,
                border: `1px solid ${color}15`,
                color: color
            }}
        >
            {icon}
            <span className="opacity-70">{label}</span>
            <span>{value}</span>
        </div>
    );
}
