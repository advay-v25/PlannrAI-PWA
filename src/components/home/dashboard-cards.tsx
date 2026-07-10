'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Target, Sparkles, Brain, Layers, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface DashboardCardsProps {
    goals: Array<{ id: string; title: string; progress?: number; minutes_per_day?: number; importance?: string }>;
    insight?: string;
    topTask?: { id: string; title: string } | null;
    isPreview?: boolean;
}

export function DashboardCards({ goals, insight, topTask, isPreview = false }: DashboardCardsProps) {
    // Fill with sample data if empty for visual completeness
    const displayGoals = goals && goals.length > 0 
        ? goals.slice(0, 3) 
        : [];

    const displayInsight = insight || "Ready to conquer the day.";
    const displayFocus = topTask?.title || "No pending tasks. You're all caught up!";

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Quick Capture Tile */}
            <Link href="/app/tasks" className="block outline-none focus:ring-2 focus:ring-[var(--color-primary)] rounded-2xl transition-transform hover:scale-[1.02] group">
                <GlassCard className="p-6 h-full border-white/10 hover:border-[var(--color-primary)]/30 hover:shadow-[0_0_15px_var(--color-primary-glow)] hover:bg-[var(--glass-bg-hover)] transition-all flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
                    <div className="relative h-full flex flex-col justify-between">
                        <div className="flex items-center gap-2 mb-4">
                            <Brain className="w-5 h-5 text-teal-400" />
                            <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Mindspace</h3>
                        </div>
                        <div className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl py-2 px-4 shadow-sm group-hover:bg-[var(--glass-bg-hover)] transition-all flex items-center justify-between">
                            <span className="text-white/80 text-sm font-medium">Capture a thought</span>
                            <ArrowRight className="w-4 h-4 text-white/50 group-hover:text-white/90 group-hover:translate-x-1 transition-all" />
                        </div>
                    </div>
                </GlassCard>
            </Link>

            {/* AI Insight Card */}
            <Link href="/app/coach" className="block outline-none focus:ring-2 focus:ring-[var(--color-primary)] rounded-2xl transition-transform hover:scale-[1.02]">
                <GlassCard className="p-6 h-full hover:bg-[var(--glass-bg-hover)] transition-colors">
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                        <h3 className="font-semibold text-sm text-[var(--text-secondary)]">AI Insight</h3>
                    </div>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                        {displayInsight}
                    </p>
                </GlassCard>
            </Link>



            {/* Active Goals Card */}
            <Link href="/app/goals" className="block outline-none focus:ring-2 focus:ring-[var(--color-primary)] rounded-2xl transition-transform hover:scale-[1.02] group">
                <GlassCard className="p-6 h-full hover:bg-[var(--glass-bg-hover)] transition-colors relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Target className="w-5 h-5 text-emerald-400" />
                            <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Active Goals</h3>
                        </div>
                        <span className="text-xs font-medium text-[var(--color-primary)] opacity-0 md:-translate-x-2 md:group-hover:translate-x-0 md:group-hover:opacity-100 transition-all flex items-center gap-1">
                            View all <ArrowRight className="w-3 h-3" />
                        </span>
                    </div>
                    {displayGoals.length > 0 ? (
                        <div className="space-y-4">
                            {displayGoals.map((goal) => (
                                <div key={goal.id}>
                                    <div className="flex justify-between text-xs mb-1.5 text-[var(--text-secondary)] font-medium">
                                        <span className="truncate mr-2">{goal.title}</span>
                                        <span>{goal.progress || 0}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-[var(--glass-border)] rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-emerald-400 rounded-full"
                                            style={{ width: `${goal.progress || 0}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-[var(--text-secondary)] italic">No active goals yet. Add some to track progress.</p>
                    )}
                </GlassCard>
            </Link>

            {/* Habit Stacks Coming Soon */}
            <div className="block rounded-2xl opacity-60">
                <GlassCard className="p-6 h-full border border-dashed border-white/20 bg-transparent flex flex-col justify-center relative overflow-hidden" padding="none">
                    <div className="flex items-center gap-2 mb-3">
                        <Layers className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Habit Stacks</h3>
                    </div>
                    <div className="w-full bg-black/20 border border-white/5 rounded-xl py-3 px-4 flex flex-col items-start gap-1">
                        <span className="text-indigo-300 text-xs font-bold tracking-wider uppercase">Coming Soon</span>
                        <span className="text-white/40 text-xs">Chain behaviors for effortless routines.</span>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
