
import { motion } from 'framer-motion';
import { Check, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionOption {
    id: string;
    title: string;
    impact: string;
    patch?: any;
}

interface OptionCardProps {
    option: ActionOption;
    onApply: (id: string) => void;
    isApplying?: boolean;
    isApplied?: boolean;
    disabled?: boolean;
}

export const OptionCard = ({ option, onApply, isApplying, isApplied, disabled }: OptionCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "relative overflow-hidden rounded-xl border p-4 transition-all",
                isApplied
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:border-[var(--color-primary)]/30"
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                    <h4 className={cn("font-medium text-sm", isApplied ? "text-green-400" : "text-[var(--text-primary)]")}>
                        {option.title}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                        {option.impact}
                    </p>
                </div>

                <button
                    onClick={() => onApply(option.id)}
                    disabled={disabled || isApplying || isApplied}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        isApplied
                            ? "bg-green-500/20 text-green-400 cursor-default"
                            : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    {isApplied ? (
                        <>
                            <Check className="w-3 h-3" />
                            Applied
                        </>
                    ) : isApplying ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            Apply
                            <ArrowRight className="w-3 h-3" />
                        </>
                    )}
                </button>
            </div>

            {/* Background decoration */}
            {isApplied && (
                <div className="absolute inset-0 bg-green-500/5 pointer-events-none" />
            )}
        </motion.div>
    );
};
