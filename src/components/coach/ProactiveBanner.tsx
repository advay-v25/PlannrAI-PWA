'use client';

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
    const priorityStyles = {
        high: 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/30 shadow-[0_0_15px_rgba(var(--color-warning-rgb),0.1)]',
        medium: 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30',
        low: 'bg-[var(--glass-bg)] border-[var(--glass-border)]',
    };

    return (
        <div className={`rounded-xl border p-4 backdrop-blur-md transition-all ${priorityStyles[suggestion.priority]}`}>
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h4 className="font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                        <span className="text-lg">💡</span> {suggestion.title}
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
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
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
