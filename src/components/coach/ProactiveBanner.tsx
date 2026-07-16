'use client';

import { Lightbulb, X } from 'lucide-react';
import { ProactiveSuggestion } from '@/types/coach-v4';


interface ProactiveBannerProps {
    suggestion: ProactiveSuggestion;
    onAct: () => void;
    onDismiss: () => void;
}

export function ProactiveBanner({
    suggestion,
    onAct,
    onDismiss
}: ProactiveBannerProps) {
    // Accent-stripe card treatment (matches the calendar week-view overhaul):
    // neutral bg/border everywhere, color identity demoted to a left stripe +
    // bevel instead of a full colored ring. Glow is reserved for the one
    // genuinely urgent state (high) — medium/low stay quiet.
    const priorityStyles = {
        high: 'bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-[inset_3px_0_0_0_var(--color-warning),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-warning)_40%,_black),0_0_10px_-5px_rgba(var(--color-warning-rgb),0.3)] dark:shadow-[inset_3px_0_0_0_var(--color-warning),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-warning)_40%,_black),0_0_12px_-5px_rgba(var(--color-warning-rgb),0.3)]',
        medium: 'bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-[inset_3px_0_0_0_var(--color-primary),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_40%,_black)] dark:shadow-[inset_3px_0_0_0_var(--color-primary),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_40%,_black)]',
        low: 'bg-[var(--glass-bg)] border border-[var(--glass-border)]',
    };

    return (
        <div className={`rounded-xl p-4 backdrop-blur-md transition-all ${priorityStyles[suggestion.priority]}`}>
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h4 className="font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-[var(--color-warning)] shrink-0" aria-hidden="true" /> {suggestion.title}
                    </h4>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {suggestion.message}
                    </p>
                </div>
                <button
                    onClick={onDismiss}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] ml-4 p-1 rounded-md hover:bg-[var(--glass-bg-hover)] transition-colors"
                    aria-label="Dismiss"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="mt-4 flex space-x-3">
                <button
                    onClick={onAct}
                    className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-lg"
                >
                    {suggestion.action_label}
                </button>
                <button
                    onClick={onDismiss}
                    className="px-4 py-2 text-[var(--text-secondary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm font-medium rounded-lg hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] transition-all"
                >
                    Not now
                </button>
            </div>
        </div>
    );
}
