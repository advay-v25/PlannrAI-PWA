'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    TrendingUp,
    Zap,
    Trophy,
    Activity,
    Calendar,
    Target,
    Sparkles,
    Clock
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { useGoalsManager } from '@/hooks/use-goals-manager';
import { AddGoalModal } from '@/components/goals/add-goal-modal';
import { GoalStrategyWizard } from '@/components/goals/goal-strategy-wizard';
import type { Goal } from '@/types/database';

export default function GoalDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { goals, fetchGoals, updateGoal } = useGoalsManager();
    const [goal, setGoal] = useState<Goal | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    useEffect(() => {
        if (!goals.length) {
            fetchGoals();
        }
    }, [goals.length, fetchGoals]);

    useEffect(() => {
        if (params.id && goals.length > 0) {
            const found = goals.find(g => g.id === params.id);
            if (found) {
                setGoal(found);
            }
        }
    }, [params.id, goals]);

    if (!goal) return (
        <div className="flex justify-center items-center py-20">
            <div className="animate-pulse flex items-center gap-2 text-[var(--text-tertiary)]">
                <Target className="w-5 h-5" />
                <span>Loading Goal Physics...</span>
            </div>
        </div>
    );

    // Neutral Metrics Calculations
    const totalMinutes = goal.total_completed_minutes || 0;
    const hoursInvested = Math.floor(totalMinutes / 60);
    const minsInvested = totalMinutes % 60;
    
    // Simple mock for adherence/rhythm based on streak for MVP
    const rhythm = Math.min(100, Math.round(((goal.current_streak_days || 0) / 7) * 100)) || 0;
    
    const currentPhase = goal.ai_strategy ? "Active Protocol" : "Calibration Phase";
    const energyDemand = goal.energy_demand || "Moderate";
    const weeklyTarget = goal.weekly_target_minutes || 180;

    // Cycle Progess
    const cycleStart = goal.cycle_start_date ? new Date(goal.cycle_start_date) : new Date();
    const cycleEnd = goal.cycle_end_date ? new Date(goal.cycle_end_date) : new Date(new Date().setDate(new Date().getDate() + 90));
    const now = new Date();

    const cycleTotalDays = Math.max(1, Math.floor((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)));
    const cycleDaysElapsed = Math.max(0, Math.floor((now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)));
    const cycleProgress = Math.min(100, Math.round((cycleDaysElapsed / cycleTotalDays) * 100));

    return (
        <div className="pb-24 space-y-8 animate-in fade-in duration-500">
            {/* 1. Header & Navigation */}
            <header className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                            {goal.title}
                        </h1>
                        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] mt-1">
                            <span className="capitalize">{goal.category}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Activity className="w-3 h-3 text-[var(--color-primary)]" />
                                {currentPhase}
                            </span>
                        </div>
                    </div>
                </div>
                <GlassButton variant="ghost" onClick={() => setIsEditing(true)}>Edit</GlassButton>
            </header>

            {isEditing && (
                <AddGoalModal 
                    onClose={() => setIsEditing(false)} 
                    onSave={async (data) => {
                        await updateGoal(goal.id, data);
                    }} 
                    initialValues={goal} 
                />
            )}

            {/* 2. Neutral Progress Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total Investment */}
                <GlassCard padding="md" className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center mb-2 border border-purple-500/30">
                        <Clock className="w-6 h-6 text-purple-400" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Total Investment</span>
                    <span className="text-2xl font-black font-mono mt-1">
                        {hoursInvested}<span className="text-sm font-sans text-[var(--text-tertiary)] font-normal mr-1">h</span>
                        {minsInvested}<span className="text-sm font-sans text-[var(--text-tertiary)] font-normal">m</span>
                    </span>
                </GlassCard>

                {/* Rhythm / Adherence */}
                <GlassCard padding="md" className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-2 border border-emerald-500/30">
                        <Activity className="w-6 h-6 text-emerald-400" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Current Rhythm</span>
                    <span className="text-2xl font-black font-mono mt-1">{rhythm}<span className="text-sm font-sans text-[var(--text-tertiary)] font-normal">%</span></span>
                </GlassCard>

                {/* Phase */}
                <GlassCard padding="md" className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center mb-2 border border-indigo-500/30">
                        <Target className="w-6 h-6 text-indigo-400" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Focus Phase</span>
                    <span className="text-sm font-bold mt-2 text-white/90">{currentPhase}</span>
                </GlassCard>

                {/* Energy Alignment */}
                <GlassCard padding="md" className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-2 border border-orange-500/30">
                        <Zap className="w-6 h-6 text-orange-400" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Energy Demand</span>
                    <span className="text-sm font-bold mt-2 text-white/90 capitalize">{energyDemand}</span>
                </GlassCard>
            </div>

            {/* 3. Cycle Progress Timeline */}
            <GlassCard padding="lg" className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">90-Day Cycle Progress</h2>
                        <p className="text-sm text-[var(--text-tertiary)]">
                            Day {cycleDaysElapsed} of {cycleTotalDays}
                        </p>
                    </div>
                </div>

                <div className="relative pt-8">
                    {/* The Rail */}
                    <div className="h-3 w-full bg-[var(--glass-border)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-[var(--color-primary)] to-purple-500 transition-all duration-1000 ease-out"
                            style={{ width: `${cycleProgress}%` }}
                        />
                    </div>

                    {/* Milestones / Nodes */}
                    <div className="absolute top-0 left-0 w-full flex justify-between px-1">
                        {[0, 30, 60, 90].map((dayMarker, i) => (
                            <div key={dayMarker} className="flex flex-col items-center -ml-3" style={{ left: `${(i / 3) * 100}%`, position: i > 0 && i < 3 ? 'absolute' : 'relative' }}>
                                <div className={`w-1 h-3 mb-1 rounded-full ${cycleDaysElapsed >= dayMarker ? 'bg-[var(--color-primary)]' : 'bg-[var(--text-tertiary)]/30'}`} />
                                <span className={`text-[10px] font-bold ${cycleDaysElapsed >= dayMarker ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>D{dayMarker}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </GlassCard>

            {/* 4. AI Strategy & Expert Routines */}
            <GlassCard padding="lg" className="border border-purple-500/20 bg-gradient-to-b from-purple-500/5 to-transparent">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-purple-400" />
                            <h2 className="text-lg font-bold text-purple-100">AI Expert Strategy</h2>
                        </div>
                        <p className="text-sm text-[var(--text-tertiary)] max-w-xl">
                            {goal.ai_strategy ? "We've mapped a path based on your energy patterns." : "Unlock the intelligence engine to generate a specialized path for this cycle."}
                        </p>
                    </div>
                    <GlassButton variant="primary" onClick={() => setIsWizardOpen(true)}>
                        {goal.ai_strategy ? 'View Path' : 'Generate'}
                    </GlassButton>
                </div>
            </GlassCard>

            <GoalStrategyWizard
                goal={goal}
                isOpen={isWizardOpen}
                onClose={() => setIsWizardOpen(false)}
                onStrategyApplied={(strategy) => {
                    setGoal((prev) => prev ? { ...prev, ai_strategy: strategy } : prev);
                }}
            />

        </div>
    );
}

