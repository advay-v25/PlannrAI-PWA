'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { logReviewWindow, prettyLongDate, type ReviewWindow } from '@/lib/weekly-review/window';

/**
 * Prompt 54 §2: on a Monday (user's timezone), the review is the first thing
 * the user sees on any /app route — as a prompt, never a redirect.
 *
 * Whether to show it is the SERVER's decision (`should_prompt` from /status:
 * Monday, last week unreviewed, at least one prior week of data, onboarding
 * complete). The only client-side input is the dismissal, keyed by
 * `week_start` so a "Not now" cannot leak into the following week.
 */
const dismissKey = (weekStart: string) => `plannr:weekly-review-prompt:dismissed:${weekStart}`;

function isDismissed(weekStart: string): boolean {
    try {
        return localStorage.getItem(dismissKey(weekStart)) === '1';
    } catch {
        return false;
    }
}

function markDismissed(weekStart: string) {
    try {
        localStorage.setItem(dismissKey(weekStart), '1');
    } catch {
        /* private mode — the prompt simply reappears on the next load */
    }
}

interface StatusLite {
    window: ReviewWindow;
    should_prompt: boolean;
}

export function MondayReviewPrompt() {
    const pathname = usePathname();
    const router = useRouter();
    const [status, setStatus] = useState<StatusLite | null>(null);
    const [dismissed, setDismissed] = useState(true);

    // The review page IS the review; prompting there would be noise.
    const onReviewPage = pathname?.startsWith('/app/weekly-review');

    // Fetched on mount, and re-checked on every route change WHILE the window
    // is open — the layout outlives the review page, so without this a review
    // completed a moment ago would still be prompted for. Off-window the
    // answer cannot change until tomorrow, so nothing is refetched.
    useEffect(() => {
        if (status && !status.window.is_open) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await apiClient.get<StatusLite>('/api/weekly-review/status');
                if (cancelled) return;
                if (!status) logReviewWindow('prompt', res.window);
                setStatus(res);
                setDismissed(isDismissed(res.window.last_monday));
            } catch (err) {
                // No status, no prompt. Never an error surface.
                console.warn('[MondayReviewPrompt] status unavailable:', err);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    const show = !!status?.should_prompt && !dismissed && !onReviewPage;

    const dismiss = () => {
        if (status) markDismissed(status.window.last_monday);
        setDismissed(true);
    };

    const start = () => {
        // Starting is not dismissing: if the user backs out without finishing,
        // the prompt is still owed for the rest of the day.
        router.push('/app/weekly-review');
    };

    return (
        <AnimatePresence>
            {show && status && (
                <motion.div
                    key="monday-prompt"
                    role="dialog"
                    aria-labelledby="monday-prompt-title"
                    data-testid="monday-review-prompt"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 24 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    className="fixed z-[60] left-4 right-4 bottom-24 md:bottom-6 md:left-auto md:right-6 md:w-[420px]"
                >
                    <div className="relative p-5 rounded-3xl border border-[var(--color-primary)]/40 bg-[var(--color-bg-primary)] shadow-2xl shadow-[var(--color-primary)]/20 backdrop-blur-xl">
                        <button
                            onClick={dismiss}
                            aria-label="Not now"
                            className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <div className="flex items-start gap-3 pr-6">
                            <div className="w-10 h-10 shrink-0 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center">
                                <Activity className="w-5 h-5 text-[var(--color-primary)]" />
                            </div>
                            <div>
                                <h2 id="monday-prompt-title" className="text-base font-bold text-[var(--text-primary)]">
                                    It&apos;s Monday — time for your weekly review
                                </h2>
                                <p className="text-sm text-[var(--text-tertiary)] mt-1">
                                    Look back at the week of {prettyLongDate(status.window.last_monday)}, then
                                    plan this one. Open today only.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button
                                onClick={start}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-bold hover:brightness-110 transition-all"
                            >
                                Start weekly review
                            </button>
                            <button
                                onClick={dismiss}
                                className="px-4 py-2.5 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] transition-colors"
                            >
                                Not now
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
