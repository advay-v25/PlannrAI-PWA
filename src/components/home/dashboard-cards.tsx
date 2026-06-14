'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Target, Sparkles, Crosshair, Brain } from 'lucide-react';
import Link from 'next/link';

interface DashboardCardsProps {
    goals: Array<{ id: string; title: string; progress?: number; minutes_per_day?: number; importance?: string }>;
    insight?: string;
    topTask?: { id: string; title: string } | null;
}

export function DashboardCards({ goals, insight, topTask }: DashboardCardsProps) {
    // Fill with sample data if empty for visual completeness
    const displayGoals = goals && goals.length > 0 
        ? goals.slice(0, 3) 
        : [];

    const displayInsight = insight || "Ready to conquer the day.";
    const displayFocus = topTask?.title || "No pending tasks. You're all caught up!";

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Quick Capture Tile */}
            <Link href="/app/tasks" className="block outline-none focus:ring-2 focus:ring-[var(--color-primary)] rounded-2xl transition-transform hover:scale-[1.02] group">
                <GlassCard className="p-6 h-full border-white/10 hover:border-teal-500/30 hover:shadow-[0_0_15px_rgba(45,212,191,0.15)] hover:bg-[var(--glass-bg-hover)] transition-all flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-4">
                            <Brain className="w-5 h-5 text-teal-400" />
                            <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Mindspace</h3>
                        </div>
                        <div className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 shadow-inner group-hover:border-white/10 group-hover:bg-black/50 transition-all flex items-center">
                            <span className="text-white/30 text-sm font-light italic">What's on your mind?</span>
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

            {/* Habit Stacks (Coming Soon) */}
            <GlassCard className="p-6 relative overflow-hidden group">
                {/* Construction Strip */}
                <div className="absolute top-5 -right-12 bg-yellow-500 text-black text-[10px] font-bold py-1 w-40 text-center rotate-45 transform uppercase tracking-wider z-10 shadow-lg">
                    Coming Soon
                </div>
                
                <div className="flex items-center gap-2 mb-4 opacity-50 transition-opacity group-hover:opacity-100">
                    <Target className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Habit Stacks</h3>
                </div>
                <div className="space-y-3 opacity-30 grayscale transition-all duration-300 group-hover:opacity-50">
                    <div className="h-2 w-full bg-[var(--glass-border)] rounded-full overflow-hidden">
                        <div className="h-full w-2/3 bg-emerald-400" />
                    </div>
                    <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>Morning Stack</span>
                        <span>2/3 Done</span>
                    </div>
                </div>
            </GlassCard>

            {/* Active Goals Card */}
            <Link href="/app/goals" className="block outline-none focus:ring-2 focus:ring-[var(--color-primary)] rounded-2xl transition-transform hover:scale-[1.02]">
                <GlassCard className="p-6 h-full hover:bg-[var(--glass-bg-hover)] transition-colors">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Active Goals</h3>
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
        </div>
    );
}
