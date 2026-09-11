'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, RotateCcw, X, SkipForward, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getCelebrationMessage } from '@/lib/celebration';

export type SweepStatus = 'done' | 'partial' | 'missed' | 'skipped';

export interface UnmarkedBlock {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    block_type?: string | null;
    pillar?: string | null;
}

export interface UnmarkedPayload {
    date: string;
    is_yesterday: boolean;
    blocks: UnmarkedBlock[];
}

const OPTIONS: { value: SweepStatus; label: string; icon: any; color: string; bg: string }[] = [
    { value: 'done', label: 'Done', icon: Check, color: 'var(--color-success)', bg: 'var(--color-success-soft)' },
    { value: 'partial', label: 'Partial', icon: RotateCcw, color: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
    { value: 'missed', label: 'Missed', icon: X, color: 'var(--text-secondary)', bg: 'var(--glass-bg)' },
    { value: 'skipped', label: 'Skipped', icon: SkipForward, color: 'var(--text-tertiary)', bg: 'var(--glass-bg)' },
];

const trimTime = (t?: string | null) => (t || '').slice(0, 5);

/**
 * End-of-day completion sweep.
 *
 * Nothing in this app has ever asked users to record whether a block actually
 * happened, which is why every completion number downstream reads as zero. This
 * is the collection point. It is deliberately low-friction: each tap persists on
 * its own, a half-finished sweep still keeps what was answered, and it never
 * blocks the app.
 */
export function DaySweep({
    unmarked,
    onMarked,
}: {
    unmarked: UnmarkedPayload | null;
    onMarked?: () => void;
}) {
    const [dismissed, setDismissed] = useState(false);
    const [marked, setMarked] = useState<Record<string, SweepStatus>>({});
    const [pending, setPending] = useState<Record<string, boolean>>({});

    // A fresh payload (new day, or new blocks needing attention) reopens the sheet.
    useEffect(() => {
        setDismissed(false);
        setMarked({});
        setPending({});
    }, [unmarked?.date, unmarked?.blocks.length]);

    const closingLine = useMemo(() => getCelebrationMessage('weeklyProgress'), []);

    const remaining = (unmarked?.blocks || []).filter((b) => !marked[b.id]);
    const isOpen = !!unmarked && !dismissed && unmarked.blocks.length > 0;

    const mark = async (block: UnmarkedBlock, status: SweepStatus) => {
        if (pending[block.id]) return;

        // Optimistic: the row settles immediately, the write follows.
        setMarked((prev) => ({ ...prev, [block.id]: status }));
        setPending((prev) => ({ ...prev, [block.id]: true }));

        try {
            await apiClient.post('/api/calendar/block-status', { block_id: block.id, status });
            onMarked?.();
        } catch (e) {
            console.error('[DaySweep] Failed to mark block:', e);
            // Put it back so the answer is not silently lost.
            setMarked((prev) => {
                const next = { ...prev };
                delete next[block.id];
                return next;
            });
        } finally {
            setPending((prev) => ({ ...prev, [block.id]: false }));
        }
    };

    return (
        <AnimatePresence>
            {isOpen && unmarked && (
                <motion.div
                    key="day-sweep"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
                >
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setDismissed(true)}
                    />

                    <motion.div
                        initial={{ y: 40, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 40, opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="relative w-full sm:max-w-lg max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-bg-secondary)] border border-[var(--glass-border)] shadow-2xl overflow-hidden"
                    >
                        <header className="flex items-start justify-between gap-4 p-5 border-b border-[var(--glass-border)]">
                            <div>
                                <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                    {unmarked.is_yesterday ? 'Yesterday still needs marking' : 'How did today go?'}
                                </h2>
                                <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                                    {remaining.length} {remaining.length === 1 ? 'block' : 'blocks'} left. Tap what
                                    happened — no wrong answers.
                                </p>
                            </div>
                            <button
                                onClick={() => setDismissed(true)}
                                aria-label="Close"
                                className="shrink-0 p-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {unmarked.blocks.map((block) => {
                                const chosen = marked[block.id];
                                const isPending = pending[block.id];

                                return (
                                    <motion.div
                                        key={block.id}
                                        layout
                                        animate={{ opacity: chosen ? 0.55 : 1 }}
                                        className="p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                                    >
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <div className="min-w-0">
                                                <div className="font-medium text-[var(--text-primary)] truncate">
                                                    {block.title}
                                                </div>
                                                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                                    {trimTime(block.start_time)} – {trimTime(block.end_time)}
                                                </div>
                                            </div>
                                            {isPending && (
                                                <Loader2 className="w-4 h-4 shrink-0 animate-spin text-[var(--text-tertiary)]" />
                                            )}
                                        </div>

                                        <div className="grid grid-cols-4 gap-2">
                                            {OPTIONS.map((option) => {
                                                const Icon = option.icon;
                                                const isSelected = chosen === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        onClick={() => mark(block, option.value)}
                                                        disabled={isPending}
                                                        className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border transition-all disabled:opacity-60 ${
                                                            isSelected
                                                                ? 'border-current'
                                                                : 'border-transparent hover:border-[var(--glass-border)]'
                                                        }`}
                                                        style={{
                                                            backgroundColor: isSelected ? option.bg : 'var(--glass-bg)',
                                                            color: isSelected ? option.color : 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        <Icon className="w-4 h-4" />
                                                        <span className="text-[11px] font-medium">{option.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        <footer className="p-4 border-t border-[var(--glass-border)] flex items-center justify-between gap-3">
                            <span className="text-xs text-[var(--text-tertiary)]">{closingLine}</span>
                            <button
                                onClick={() => setDismissed(true)}
                                className="px-4 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                {remaining.length === 0 ? 'Done' : 'Later'}
                            </button>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
