'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, PauseCircle, SlidersHorizontal, X } from 'lucide-react';

export interface PendingChange {
    goal_id: string;
    title: string;
    change_type: 'pause' | 'update_time' | 'update_days' | 'delete';
    old_value: string;
    new_value: string;
    rationale?: string;
}

/**
 * Confirmation before anything is written.
 *
 * One click on Automatic used to pause every under-performing goal and rewrite
 * a week with no confirmation at all. The destructive part of the action has to
 * be visible on the button itself, not buried in body text.
 *
 * Deliberately not `window.confirm`: it blocks the event loop and renders as a
 * browser chrome dialog inside an installed PWA.
 */
export function ConfirmChangesModal({
    isOpen,
    changes,
    isApplying,
    onConfirm,
    onCancel,
}: {
    isOpen: boolean;
    changes: PendingChange[];
    isApplying?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const cancelRef = useRef<HTMLButtonElement>(null);

    // Cancel takes focus — the safe option is the default.
    useEffect(() => {
        if (isOpen) setTimeout(() => cancelRef.current?.focus(), 50);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isApplying) onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, isApplying, onCancel]);

    const pauses = changes.filter((c) => c.change_type === 'pause' || c.change_type === 'delete');
    const edits = changes.filter((c) => c.change_type === 'update_time' || c.change_type === 'update_days');

    const applyLabel = pauses.length
        ? `Pause ${pauses.length} ${pauses.length === 1 ? 'goal' : 'goals'} and apply`
        : 'Apply changes';

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-changes-title"
                >
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => !isApplying && onCancel()}
                    />

                    <motion.div
                        initial={{ y: 40, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 40, opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="relative w-full sm:max-w-lg max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-bg-secondary)] border border-[var(--glass-border)] shadow-2xl overflow-hidden"
                    >
                        <header className="flex items-start justify-between gap-4 p-5 border-b border-[var(--glass-border)]">
                            <h2
                                id="confirm-changes-title"
                                className="text-lg font-bold text-[var(--text-primary)] tracking-tight"
                            >
                                Apply these changes?
                            </h2>
                            <button
                                onClick={onCancel}
                                disabled={isApplying}
                                aria-label="Cancel"
                                className="shrink-0 p-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {pauses.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 mb-2 text-amber-400">
                                        <PauseCircle className="w-4 h-4" />
                                        <h3 className="text-sm font-bold">
                                            {pauses.length} {pauses.length === 1 ? 'goal' : 'goals'} will be paused
                                        </h3>
                                    </div>
                                    <ul className="space-y-1 pl-6">
                                        {pauses.map((c) => (
                                            <li
                                                key={c.goal_id}
                                                className="text-sm text-[var(--text-secondary)] list-disc"
                                            >
                                                {c.title}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {edits.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 mb-2 text-[var(--color-primary)]">
                                        <SlidersHorizontal className="w-4 h-4" />
                                        <h3 className="text-sm font-bold">
                                            {edits.length}{' '}
                                            {edits.length === 1 ? 'goal has' : 'goals have'} their time or days
                                            changed
                                        </h3>
                                    </div>
                                    <ul className="space-y-2 pl-6">
                                        {edits.map((c) => (
                                            <li key={c.goal_id} className="text-sm">
                                                <span className="text-[var(--text-primary)] font-medium">
                                                    {c.title}
                                                </span>
                                                <span className="block text-[var(--text-tertiary)]">
                                                    <span className="line-through">{c.old_value}</span>
                                                    {' → '}
                                                    <span className="text-[var(--text-secondary)]">
                                                        {c.new_value}
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            <p className="flex items-start gap-2 text-sm text-[var(--text-tertiary)] pt-1">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--text-muted)]" />
                                Next week&apos;s schedule will be regenerated. This week is not affected.
                            </p>
                        </div>

                        <footer className="p-4 border-t border-[var(--glass-border)] flex items-center justify-end gap-3">
                            <button
                                ref={cancelRef}
                                onClick={onCancel}
                                disabled={isApplying}
                                className="px-4 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                disabled={isApplying}
                                className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50"
                            >
                                {isApplying ? 'Applying…' : applyLabel}
                            </button>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
