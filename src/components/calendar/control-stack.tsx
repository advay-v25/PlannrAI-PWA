'use client';

import { useState } from 'react';
import { Sparkles, Calendar as CalendarIcon, Filter, Zap, RefreshCw, Layout, Layers } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { cn } from '@/lib/utils';

interface ControlStackProps {
    onPlanWeek: () => void;
    onOptimizeDay: () => void;
    filters: {
        pillars: string[];
        showAnchors: boolean;
        showMeals: boolean;
    };
    onToggleFilter: (key: string) => void;
}

export function ControlStack({ onPlanWeek, onOptimizeDay, filters, onToggleFilter }: ControlStackProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div className="flex flex-col gap-4 h-full">

            {/* AI Command Center */}
            <GlassCard padding="lg" className="space-y-3 bg-gradient-to-br from-primary/10 to-blue-500/5 border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primary/80">AI Command</span>
                </div>

                <button
                    onClick={onOptimizeDay}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--glass-bg)] dark:bg-white/5 hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 border border-[var(--glass-border)] dark:border-white/5 transition-all text-left group"
                >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                        <Zap className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-sm font-medium text-[var(--text-primary)] dark:text-white">Optimize Day</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] dark:text-white/40">Align energy & focus</div>
                    </div>
                </button>

                <button
                    onClick={onPlanWeek}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--glass-bg)] dark:bg-white/5 hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 border border-[var(--glass-border)] dark:border-white/5 transition-all text-left group"
                >
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-mind)]/10 dark:bg-[var(--color-mind)]/20 flex items-center justify-center text-[var(--color-mind)] group-hover:scale-110 transition-transform">
                        <Layout className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-sm font-medium text-[var(--text-primary)] dark:text-white">Plan Week</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] dark:text-white/40">Full schedule generate</div>
                    </div>
                </button>
            </GlassCard>

            {/* Filters */}
            <GlassCard padding="lg" className="flex-1 space-y-4">
                <div className="flex items-center gap-2 mb-2 text-[var(--text-muted)] dark:text-white/40">
                    <Filter className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Visibility</span>
                </div>

                <div className="space-y-2">
                    <FilterToggle
                        label="Anchors Only"
                        active={filters.showAnchors}
                        onClick={() => onToggleFilter('anchors')}
                        icon={<RefreshCw className="w-3 h-3" />}
                    />
                    <FilterToggle
                        label="Meals & Breaks"
                        active={filters.showMeals}
                        onClick={() => onToggleFilter('meals')}
                        icon={<Layers className="w-3 h-3" />}
                    />
                </div>

                <div className="pt-4 border-t border-[var(--glass-border)] dark:border-white/5">
                    <div className="flex items-center gap-2 mb-3 text-[var(--text-muted)] dark:text-white/40">
                        <span className="text-[10px] font-bold uppercase tracking-widest">Pillars</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {['Mind', 'Body', 'Craft'].map(p => (
                            <button
                                key={p}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--glass-bg)] dark:bg-white/5 hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 border border-[var(--glass-border)] dark:border-white/5 text-[var(--text-secondary)] dark:text-white/60"
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

            </GlassCard>
        </div>
    );
}

function FilterToggle({ label, active, onClick, icon }: any) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center justify-between p-2.5 rounded-lg transition-all text-xs font-medium border",
                active
                    ? "bg-[var(--glass-bg-active)] dark:bg-white/10 text-[var(--text-primary)] dark:text-white border-[var(--glass-border)] dark:border-white/10"
                    : "bg-transparent text-[var(--text-tertiary)] dark:text-white/40 border-transparent hover:bg-[var(--glass-bg)] dark:hover:bg-white/5"
            )}
        >
            <span className="flex items-center gap-2">{icon} {label}</span>
            <div className={cn(
                "w-2 h-2 rounded-full",
                active ? "bg-[var(--color-primary)]" : "bg-[var(--glass-bg)] dark:bg-white/10"
            )} />
        </button>
    )
}
