'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Plus,
    MoreVertical,
    Anchor,
    Brain,
    Dumbbell,
    Briefcase,
    Zap
} from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassCard } from '@/components/ui/glass-card';
import { useGoalsManager } from '@/hooks/use-goals-manager';
import { GoalCard } from '@/components/goals/goal-card';
import { GoalStrategyWizard } from '@/components/goals/goal-strategy-wizard';
import { AddGoalModal } from '@/components/goals/add-goal-modal';
import type { Goal } from '@/types/database';

export default function GoalsPage() {
    const { goals, capacity, updateGoal, deleteGoal, fetchGoals } = useGoalsManager();

    // Fetch goals on mount
    useEffect(() => {
        fetchGoals();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Feature Flags / UI State
    const [isAdding, setIsAdding] = useState(false);
    const [selectedGoalForStrategy, setSelectedGoalForStrategy] = useState<Goal | null>(null);

    // Categories Configuration
    const PILLARS = [
        { id: 'mind', label: 'Mind', icon: Brain, color: 'var(--color-mind)' },
        { id: 'body', label: 'Body', icon: Dumbbell, color: 'var(--color-body)' },
        { id: 'craft', label: 'Craft', icon: Briefcase, color: 'var(--color-craft)' },
    ];

    // Capacity Logic Helpers
    const isOverload = (capacity?.load_percentage || 0) > 100;
    const isCritical = (capacity?.load_percentage || 0) > 120;

    return (
        <div className="pb-24 space-y-8">
            {/* 1. Header & Quick Actions */}
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Goals
                    </h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Design your ideal week.</p>
                </div>
                <GlassButton variant="primary" onClick={() => setIsAdding(true)}>
                    <Plus className="w-4 h-4 mr-2" /> New Goal
                </GlassButton>
            </header>

            {/* 2. Reality Capacity Gauge */}
            <GlassCard padding="md" className="relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--glass-bg)] to-[var(--glass-bg-subtle)] opacity-50" />

                <div className="relative z-10 flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-xs uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Daily Load</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-mono font-bold text-[var(--text-primary)]">
                                    {capacity?.used_minutes || 0}
                                </span>
                                <span className="text-sm text-[var(--text-secondary)]">min</span>
                            </div>
                        </div>

                        <div className="text-right">
                            <span className={`text-2xl font-bold ${isCritical ? 'text-red-400' : isOverload ? 'text-amber-400' : 'text-green-400'}`}>
                                {capacity?.load_percentage || 0}%
                            </span>
                            <p className="text-[10px] uppercase text-[var(--text-tertiary)] tracking-wider">of Available Energy</p>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-[var(--glass-border)] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(capacity?.load_percentage || 0, 100)}%` }}
                            className={`h-full ${isCritical ? 'bg-red-500' : isOverload ? 'bg-amber-500' : 'bg-green-500'}`}
                            transition={{ duration: 1, ease: 'easeOut' }}
                        />
                    </div>

                    {isOverload && (
                        <div className={`mt-2 p-3 rounded-lg text-xs flex gap-2 items-start ${isCritical ? 'bg-red-500/10 text-red-200' : 'bg-amber-500/10 text-amber-200'}`}>
                            <Zap className="w-4 h-4 flex-shrink-0" />
                            <p>
                                {isCritical
                                    ? "CRITICAL: You are committing to more time than you physically have available. Burnout is mathematical certainty."
                                    : "Warning: Your plan exceeds your daily capacity. Some habits may slip."}
                            </p>
                        </div>
                    )}
                </div>
            </GlassCard>

            {/* 3. Pillars Grid */}
            <div className="space-y-8">
                {PILLARS.map((pillar) => {
                    const pillarGoals = goals.filter(g => g.category === pillar.id && g.status !== 'archived');
                    if (pillarGoals.length === 0) return null;

                    return (
                        <section key={pillar.id} className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <pillar.icon className="w-5 h-5" style={{ color: pillar.color }} />
                                <h2 className="text-lg font-bold capitalize">{pillar.label}</h2>
                                <div className="h-px flex-1 bg-gradient-to-r from-[var(--glass-border)] to-transparent" />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pillarGoals.map(goal => (
                                    <GoalCard
                                        key={goal.id}
                                        goal={goal}
                                        onUpdate={updateGoal}
                                        onDelete={deleteGoal}
                                        onOpenStrategy={setSelectedGoalForStrategy}
                                        pillarColor={pillar.color}
                                    />
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>

            {/* Empty State */}
            {goals.length === 0 && (
                <div className="text-center py-20 opacity-50">
                    <p className="text-sm">No goals set yet. Start by designing your ideal life.</p>
                </div>
            )}

            {/* Modals */}
            <AnimatePresence>
                {isAdding && (
                    <AddGoalModal
                        onClose={() => setIsAdding(false)}
                        onSuccess={() => fetchGoals()}
                    />
                )}
                {selectedGoalForStrategy && (
                    <GoalStrategyWizard
                        goal={selectedGoalForStrategy}
                        isOpen={!!selectedGoalForStrategy}
                        onClose={() => setSelectedGoalForStrategy(null)}
                        onStrategyApplied={(strategy) => {
                            updateGoal(selectedGoalForStrategy.id, { ai_strategy: strategy });
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
