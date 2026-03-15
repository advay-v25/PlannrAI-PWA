'use client';

import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

interface OptionCardProps {
    option: {
        id: string;
        title: string;
        description: string;
        impact?: string;
        recommended?: boolean;
        tradeoff?: {
            warning: string;
            severity: string;
        };
    };
    isApplying: boolean;
    isApplied: boolean;
    onApply: () => void;
}

export function OptionCard({ option, isApplying, isApplied, onApply }: OptionCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border transition-all ${
                isApplied
                    ? 'bg-[var(--color-success)]/5 border-[var(--color-success)]/20'
                    : option.recommended
                        ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20'
                        : 'bg-[var(--glass-bg)] border-[var(--glass-border)]'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{option.title}</h4>
                        {option.recommended && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                                Recommended
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{option.description}</p>
                    {option.impact && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">{option.impact}</p>
                    )}
                    {option.tradeoff && (
                        <p className={`text-xs mt-1 ${
                            option.tradeoff.severity === 'warning' ? 'text-[var(--color-warning)]' :
                            option.tradeoff.severity === 'caution' ? 'text-[var(--color-error)]' :
                            'text-[var(--text-tertiary)]'
                        }`}>
                            ⚠ {option.tradeoff.warning}
                        </p>
                    )}
                </div>
                <button
                    onClick={onApply}
                    disabled={isApplying || isApplied}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isApplied
                            ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] cursor-default'
                            : 'bg-[var(--color-primary)] text-white hover:brightness-110 active:scale-[0.96] disabled:opacity-50'
                    }`}
                >
                    {isApplied ? (
                        <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Applied</span>
                    ) : isApplying ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        'Apply'
                    )}
                </button>
            </div>
        </motion.div>
    );
}
