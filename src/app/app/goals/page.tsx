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
import { isPreviewEnabled } from '@/lib/featureFlags';

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
        <div className="w-full min-h-full relative">
            {/* SVG organic ribbon flows — folded fabric effect */}
            <div className="absolute inset-0 pointer-events-none z-[-1]">
              <div aria-hidden style={{ position: 'sticky', top: 0, height: '100dvh', width: '100%', overflow: 'hidden' }}>
                {/* Top shimmer line */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                  background: 'linear-gradient(to right, transparent, hsla(190,100%,70%,0.55) 40%, hsla(210,100%,65%,0.42) 65%, transparent)',
                }} />
                <svg
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4, filter: 'blur(4px)' }}
                  viewBox="0 0 1440 900"
                  preserveAspectRatio="xMidYMid slice"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="goals-r1" x1="1440" y1="-100" x2="0" y2="900" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="hsla(190,100%,60%,0.22)" />
                      <stop offset="40%" stopColor="hsla(200,90%,40%,0.10)" />
                      <stop offset="100%" stopColor="hsla(210,60%,15%,0)" />
                    </linearGradient>
                    <linearGradient id="goals-r2" x1="1440" y1="200" x2="200" y2="900" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="hsla(200,90%,55%,0.14)" />
                      <stop offset="55%" stopColor="hsla(190,85%,45%,0.06)" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <linearGradient id="goals-r3" x1="1" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsla(190,100%,50%,0.15)" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <filter id="goals-shadow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="30" />
                    </filter>
                    <filter id="goals-glow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="10" />
                    </filter>
                  </defs>

                  {/* FOLD 1 — main lit face, top-right to lower-left */}
                  <path
                    d="M 1600 -200 C 1300 20 1050 200 820 390 C 590 580 370 720 0 890 L 0 2000 L 1600 2000 Z"
                    fill="url(#goals-r1)"
                  />
                  {/* FOLD 1 — valley shadow */}
                  <path
                    d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000"
                    stroke="hsla(200,60%,5%,0.55)"
                    strokeWidth="100"
                    fill="none"
                    filter="url(#goals-shadow)"
                  />
                  {/* FOLD 1 — bright ridge highlight */}
                  <path
                    d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000"
                    stroke="hsla(190,90%,78%,0.55)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  {/* FOLD 1 — soft glow halo */}
                  <path
                    d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000"
                    stroke="hsla(195,85%,62%,0.26)"
                    strokeWidth="38"
                    fill="none"
                    filter="url(#goals-glow)"
                  />

                  {/* FOLD 2 — secondary ribbon face */}
                  <path
                    d="M 1600 160 C 1300 360 1050 510 820 660 C 590 810 370 890 0 2000 L 0 2000 L 1600 2000 Z"
                    fill="url(#goals-r2)"
                  />
                  {/* FOLD 2 — bright ridge highlight */}
                  <path
                    d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 2000"
                    stroke="hsla(200,85%,68%,0.30)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  {/* FOLD 2 — soft glow halo */}
                  <path
                    d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 2000"
                    stroke="hsla(195,85%,60%,0.16)"
                    strokeWidth="32"
                    fill="none"
                    filter="url(#goals-glow)"
                  />

                  {/* Upper-right corner fill accent */}
                  <path
                    d="M 1600 -350 C 1500 -180 1350 -70 1200 40 C 1050 150 950 230 820 340 L 1600 340 Z"
                    fill="url(#goals-r3)"
                  />
                </svg>
              </div>
            </div>
            <div className="max-w-5xl mx-auto p-4 md:p-8 pb-32 md:pb-10 space-y-6">
            {/* 1. Header & Quick Actions */}
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 pb-2">
                        Goals
                    </h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Design your ideal week.</p>
                </div>
                <div className="flex items-center gap-3">
                    {isPreviewEnabled() && (
                        <GlassButton variant="primary" onClick={() => {}}>
                            <Zap className="w-4 h-4 mr-2 text-orange-400" /> Generate Plan
                        </GlassButton>
                    )}
                    <GlassButton variant="primary" onClick={() => setIsAdding(true)}>
                        <Plus className="w-4 h-4 mr-2" /> New Goal
                    </GlassButton>
                </div>
            </header>

            {/* 2. Reality Capacity Gauge */}
            <GlassCard padding="sm" className="relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--glass-bg)] to-[var(--glass-bg-subtle)] opacity-50" />

                <div className="relative z-10 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Daily Load</span>
                        <div className="flex items-center gap-3">
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-mono font-bold text-[var(--text-primary)]">
                                    {capacity?.used_minutes || 0}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)]">min</span>
                            </div>
                            <span className="text-[var(--text-tertiary)]">•</span>
                            <span className={`text-xl font-bold ${isCritical ? 'text-red-400' : isOverload ? 'text-amber-400' : 'text-green-400'}`}>
                                {capacity?.load_percentage || 0}%
                            </span>
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
            <div className="space-y-6">
                {PILLARS.map((pillar) => {
                    const pillarGoals = goals.filter(g => g.category === pillar.id && g.status !== 'archived');
                    if (pillarGoals.length === 0) return null;

                    return (
                        <section key={pillar.id} className="space-y-6 pt-4">
                            <div className="flex items-center gap-4 px-1">
                                <h2 className="text-3xl font-bold capitalize text-white">{pillar.label}</h2>
                                <div className="h-px flex-1 bg-white/20" />
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
                <div className="text-center py-20 flex flex-col items-center justify-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2 shadow-inner">
                        <Anchor className="w-8 h-8 text-white/40" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white/80">No goals set yet</h3>
                        <p className="text-sm text-white/50 max-w-sm mt-2">
                            Start by designing your ideal life. Set your first goal across Mind, Body, or Craft to establish your baseline.
                        </p>
                    </div>
                    <GlassButton variant="primary" className="mt-4" onClick={() => setIsAdding(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Add your first goal
                    </GlassButton>
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
        </div>
    );
}
