'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CalendarRange, PauseCircle, SlidersHorizontal, X } from 'lucide-react';

export interface PendingChange {
    goal_id: string;
    title: string;
    /** The only change there is: the same hours, arranged differently. */
    change_type: 'reshape' | string;
    old_value: string;
    new_value: string;
    headline?: string;
    old_weekly_minutes?: number;
    new_weekly_minutes?: number;
    rationale?: string;
    /** Why this goal. A user should be able to see what they are reacting to. */
    evidence?: {
        missed_minutes: number;
        missed_dates: string[];
        completed_minutes: number;
        target_minutes: number;
    };
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtMins = (m: number) => {
    const v = Math.max(0, Math.round(m));
    const h = Math.floor(v / 60);
    const rem = v % 60;
    if (h === 0) return `${rem}m`;
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

/** "You missed Stocks on Wed and Fri — 55 minutes short of your 3h target." */
function evidenceLine(c: PendingChange): string | null {
    const e = c.evidence;
    if (!e || e.missed_minutes <= 0) return null;
    const days = e.missed_dates
        .map((d) => WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()])
        .filter(Boolean);
    const where =
        days.length === 0
            ? ''
            : days.length === 1
              ? ` on ${days[0]}`
              : ` on ${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
    return `You missed ${c.title}${where} — ${fmtMins(e.missed_minutes)} short of your ${fmtMins(e.target_minutes)} target.`;
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
    isPlanning,
    targetWeekLabel,
    onConfirm,
    onCancel,
}: {
    isOpen: boolean;
    changes: PendingChange[];
    isApplying?: boolean;
    /** True once the wait is the week generation rather than the goal writes. */
    isPlanning?: boolean;
    /** e.g. "1–7 Sep" — the window that is about to be rebuilt. */
    targetWeekLabel?: string;
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

    // Prompt 38: there is only one kind of change left, so there is only one
    // list. Nothing here can take hours away, which is why the "will lose
    // hours" section is gone rather than merely empty.
    const reshapes = changes;

    const applyLabel = changes.length === 0 ? 'Plan current week' : 'Apply changes';

    const getLateOpenMessage = () => {
        const now = new Date();
        const todayIndex = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
        if (todayIndex === 1) return null; // Monday, nothing passed

        const todayName = WEEKDAY[todayIndex];
        const passedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        if (todayIndex === 2) return `Planning ${todayName} to Sunday — Monday has already happened.`;
        if (todayIndex === 0) return `Planning Sunday — Monday to Saturday have already happened.`;

        const passed = passedDays.slice(0, todayIndex - 1);
        if (passed.length === 2) {
            return `Planning ${todayName} to Sunday — ${passed[0]} and ${passed[1]} have already happened.`;
        } else {
            return `Planning ${todayName} to Sunday — Monday to ${passed[passed.length - 1]} have already happened.`;
        }
    };

    const lateOpenMessage = getLateOpenMessage();

    const shapeRow = (c: PendingChange) => {
        const why = evidenceLine(c);
        return (
            <li key={c.goal_id} className="text-sm">
                <span className="text-[var(--text-primary)] font-medium">{c.title}</span>
                <span className="block text-[var(--text-tertiary)]">
                    <span className="line-through">{c.old_value}</span>
                    {' → '}
                    <span className="text-[var(--text-secondary)]">{c.new_value}</span>
                </span>
                {why && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{why}</span>}
            </li>
        );
    };

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
                            {reshapes.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 mb-2 text-[var(--color-primary)]">
                                        <SlidersHorizontal className="w-4 h-4" />
                                        <h3 className="text-sm font-bold">
                                            {reshapes.length}{' '}
                                            {reshapes.length === 1 ? 'goal keeps' : 'goals keep'} exactly the
                                            same weekly hours, in a new shape
                                        </h3>
                                    </div>
                                    <ul className="space-y-2 pl-6">{reshapes.map(shapeRow)}</ul>
                                </section>
                            )}

                            {/* Says what is actually true. The previous copy
                                promised unchanged goals would keep identical
                                times — that was carry-forward's guarantee, and
                                carry-forward is gone. The planner is
                                deterministic, so unchanged goals will mostly
                                land where they landed before; "mostly" is not a
                                guarantee and must not be written as one. */}
                            <section className="pt-1">
                                <div className="flex items-center gap-2 mb-2 text-[var(--text-secondary)]">
                                    <CalendarRange className="w-4 h-4" />
                                    <h3 className="text-sm font-bold">
                                        This week{targetWeekLabel ? ` (${targetWeekLabel})` : ''} will be planned, with {changes.length === 0 ? 'no' : changes.length}{' '}
                                        {changes.length === 1 ? 'change' : 'changes'} applied to the calendar
                                    </h3>
                                </div>
                                <ul className="space-y-1 pl-6 text-sm text-[var(--text-tertiary)] list-disc">
                                    <li>
                                        <strong>Your hours never go down.</strong> Every change here keeps
                                        the same weekly total — only the days and times move.
                                    </li>
                                    <li>
                                        <strong>Your goals stay exactly as they are.</strong> This changes
                                        this week&apos;s calendar only — edit them on the Goals page if you
                                        want a permanent change.
                                    </li>
                                    <li>
                                        Sleep, meals, your morning routine and wind-down are rebuilt from
                                        your profile; commitments stay where they are.
                                    </li>
                                    {lateOpenMessage ? (
                                        <li className="text-[var(--color-warning)] font-medium">
                                            {lateOpenMessage}
                                        </li>
                                    ) : (
                                        <li>This week is not touched — nothing dated today or earlier changes.</li>
                                    )}
                                </ul>
                            </section>

                            {changes.length === 0 && (
                                <p className="flex items-start gap-2 text-sm text-[var(--text-tertiary)]">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--text-muted)]" />
                                    No goal changes are being applied — this week is simply rebuilt from
                                    your current goals.
                                </p>
                            )}
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
                                {isApplying ? (isPlanning ? 'Planning week…' : 'Applying…') : applyLabel}
                            </button>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
