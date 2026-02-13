import { motion } from 'framer-motion';
import { Activity, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';

interface UsageGaugeProps {
    daily: number;
    limit: number;
    monthly?: number;
    className?: string;
}

export function UsageGauge({ daily, limit, monthly, className }: UsageGaugeProps) {
    const percentage = Math.min(100, Math.max(0, (daily / limit) * 100));
    const isLow = percentage > 80;
    const isCritical = percentage > 95;

    return (
        <GlassCard padding="lg" className={cn("relative overflow-hidden group", className)}>
            {/* Background Pulse */}
            <div className={cn(
                "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-700",
                isCritical ? "bg-red-500" : "bg-[var(--color-primary)]"
            )} />

            <div className="relative z-10 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "p-2 rounded-lg bg-white/5 border border-white/10",
                            isCritical ? "text-red-400" : "text-[var(--color-primary)]"
                        )}>
                            <Zap className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[var(--text-primary)]">Neural Capacity</h3>
                            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">Daily Allocation</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold tracking-tighter tabular-nums text-[var(--text-primary)]">
                            {Math.round(100 - percentage)}%
                        </div>
                        <p className="text-[10px] text-[var(--text-tertiary)]">Remaining</p>
                    </div>
                </div>

                {/* Gauge Bar */}
                <div className="h-4 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 relative">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex justify-between px-1">
                        {[...Array(10)].map((_, i) => (
                            <div key={i} className="w-[1px] h-full bg-white/5" />
                        ))}
                    </div>

                    {/* Fill */}
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className={cn(
                            "h-full rounded-full relative overflow-hidden",
                            isCritical ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-[var(--color-primary)]"
                        )}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
                    </motion.div>
                </div>

                {/* Footer Stats */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                    <div className="space-y-0.5">
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase block">Processed Today</span>
                        <span className="text-xs font-mono text-[var(--text-secondary)]">
                            {daily.toLocaleString()} <span className="text-[var(--text-tertiary)]">/ {limit.toLocaleString()} ops</span>
                        </span>
                    </div>
                    {monthly !== undefined && (
                        <div className="space-y-0.5 text-right">
                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase block">Total Cycles</span>
                            <span className="text-xs font-mono text-[var(--text-secondary)]">
                                {monthly.toLocaleString()}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </GlassCard>
    );
}
