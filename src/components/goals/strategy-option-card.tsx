
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';

interface StrategyOptionCardProps {
    option: {
        label: string;
        tradeoff?: string;
        patch: any;
    };
    onApply: () => Promise<void>;
    disabled?: boolean;
}

export function StrategyOptionCard({ option, onApply, disabled }: StrategyOptionCardProps) {
    const [isApplying, setIsApplying] = useState(false);
    const [isApplied, setIsApplied] = useState(false);

    const handleApply = async () => {
        if (isApplying || isApplied || disabled) return;

        setIsApplying(true);
        try {
            await onApply();
            setIsApplied(true);
        } catch (error) {
            console.error("Failed to apply strategy:", error);
            // Reset on error so user can try again
            setIsApplying(false);
        }
    };

    return (
        <GlassCard
            className="group relative overflow-hidden transition-all hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/5 border border-[var(--glass-border)] dark:border-white/10 hover:border-[var(--color-primary)]/30"
            padding="md"
        >
            <div className="flex flex-col gap-4">
                {/* Header */}
                <div className="space-y-1">
                    <h4 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                        {option.label}
                    </h4>
                    {option.tradeoff && (
                        <p className="text-xs text-[var(--text-tertiary)] ml-6">
                            {option.tradeoff}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <button
                    onClick={handleApply}
                    disabled={disabled || isApplying || isApplied}
                    className={cn(
                        "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all",
                        isApplied
                            ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                            : isApplying
                                ? "bg-[var(--glass-bg)] text-[var(--text-tertiary)] cursor-wait"
                                : "bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20"
                    )}
                >
                    {isApplied ? (
                        <>
                            <Check className="w-4 h-4" />
                            Active Strategy
                        </>
                    ) : isApplying ? (
                        <>
                            <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            Applying...
                        </>
                    ) : (
                        <>
                            Select Strategy <ArrowRight className="w-3.5 h-3.5" />
                        </>
                    )}
                </button>
            </div>
        </GlassCard>
    );
}
