'use client';

import { motion } from 'framer-motion';
import { Check, Loader2, ArrowRight } from 'lucide-react';

interface OptionCardProps {
    option: {
        id: string;
        title: string;
        impact: string;
        patch?: { ops?: any[]; reason?: string };
    };
    isApplying?: boolean;
    isApplied?: boolean;
    onApply: () => void;
}

export function OptionCard({ option, isApplying, isApplied, onApply }: OptionCardProps) {
    const opCount = option.patch?.ops?.length || 0;
    const opTypes = option.patch?.ops?.map(o => o.op).filter(Boolean) || [];
    const uniqueOps = [...new Set(opTypes)];

    // Generate a short summary of what the patch does
    const patchSummary = opCount > 0
        ? uniqueOps.map(op => {
            const count = opTypes.filter(t => t === op).length;
            const label = op.replace(/_/g, ' ').replace('event', '').trim();
            return count > 1 ? `${count} ${label}s` : `1 ${label}`;
        }).join(', ')
        : 'No changes';

    return (
        <motion.div
            layout
            className={`group relative rounded-xl border p-3 transition-all cursor-pointer ${isApplied
                    ? 'bg-[var(--color-success)]/5 border-[var(--color-success)]/20'
                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]'
                }`}
            onClick={() => !isApplying && !isApplied && onApply()}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${isApplied ? 'text-[var(--color-success)]' : 'text-[var(--text-primary)]'
                        }`}>
                        {option.title}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-normal">
                        {option.impact}
                    </p>
                    {/* Patch Summary Badge */}
                    {opCount > 0 && !isApplied && (
                        <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-primary)]/5 text-[var(--color-primary)]/70 border border-[var(--color-primary)]/10">
                            {patchSummary}
                        </span>
                    )}
                </div>
                <div className="flex-shrink-0 mt-0.5">
                    {isApplying ? (
                        <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin" />
                    ) : isApplied ? (
                        <div className="w-5 h-5 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
                            <Check className="w-3 h-3 text-[var(--color-success)]" />
                        </div>
                    ) : (
                        <div className="w-5 h-5 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center group-hover:border-[var(--color-primary)]/30 group-hover:bg-[var(--color-primary)]/5 transition-all">
                            <ArrowRight className="w-3 h-3 text-[var(--text-tertiary)] group-hover:text-[var(--color-primary)] transition-colors" />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
