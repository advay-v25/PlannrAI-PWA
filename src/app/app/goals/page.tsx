'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useGoalsStore, useUserStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { AddGoalModal } from '@/components/goals/add-goal-modal';
import { CommitmentModal } from '@/components/goals/commitment-modal';
import { ClearGoalsDialog } from '@/components/goals/clear-goals-dialog';
import { GoalStrategyModal } from '@/components/goals/goal-strategy-modal';
import { GlassInput } from '@/components/ui/glass-input';
import {
    Brain,
    Dumbbell,
    Briefcase, // Craft
    Plus,
    X,
    Sparkles,
    Clock,
    Zap, // Energy
    Flag, // Priority
    Play,
    Pause,
    Trash2,
    Save,
    AlertTriangle,
    Anchor,
    MoreVertical
} from 'lucide-react';
import type { Goal, GoalCategory, GoalImportance, EnergyDemand, GoalStatus } from '@/types/database';

const PILLARS = [
    { id: 'mind' as GoalCategory, label: 'Mind', icon: Brain, color: 'var(--color-mind)', softColor: 'var(--color-mind-soft)' },
    { id: 'body' as GoalCategory, label: 'Body', icon: Dumbbell, color: 'var(--color-body)', softColor: 'var(--color-body-soft)' },
    { id: 'craft' as GoalCategory, label: 'Craft', icon: Briefcase, color: 'var(--color-craft)', softColor: 'var(--color-craft-soft)' },
];

export default function GoalsPage() {
    const supabase = createClient();
    const { goals, setGoals, addGoal, updateGoal, removeGoal, setLoading } = useGoalsStore();
    const { profile } = useUserStore();

    // UI State
    const [isAdding, setIsAdding] = useState(false);
    const [creatingAnchor, setCreatingAnchor] = useState(false);
    const [clearingGoals, setClearingGoals] = useState(false);
    const [selectedStrategyGoal, setSelectedStrategyGoal] = useState<Goal | null>(null);

    // UI State for editing
    const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

    // Capacity Calculation
    // Total Minutes Planned
    const activeGoals = goals.filter(g => g.status === 'active');
    const totalMinutes = activeGoals.reduce((sum, g) => sum + g.minutes_per_day, 0);

    // Available Capacity (Wake - Sleep - Anchors - Meals - Buffers)
    // Simplified: (Wake -> Sleep) - 4h (Safety margin / Fixed blocks estimate)
    // Precise: 16h wake - 4h = 12h = 720m realistic max.
    // Let's use a dynamic but simple heuristic for now, or fetch from Profile?
    // Profile has sleep_start, sleep_end. 
    const [commitments, setCommitments] = useState<any[]>([]);

    useEffect(() => {
        async function loadData() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [goalsData, commitmentsData] = await Promise.all([
                supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('commitments').select('*').eq('user_id', user.id)
            ]);

            if (goalsData.data) setGoals(goalsData.data);
            if (commitmentsData.data) setCommitments(commitmentsData.data);
            setLoading(false);
        }
        loadData();
    }, [supabase, setGoals, setLoading]);

    // Capacity Calculation
    // 1. Wake Window
    const sleepStart = profile?.sleep_start || '23:00';
    const sleepEnd = profile?.sleep_end || '07:00';

    const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    let wakeMinutes = parseTime(sleepStart) - parseTime(sleepEnd);
    if (wakeMinutes < 0) wakeMinutes += 24 * 60; // Handle overnight

    // 2. Anchors (Average Daily Impact)
    const anchorMinutesPerWeek = commitments.reduce((weekSum, c) => {
        const start = parseTime(c.start_time);
        const end = parseTime(c.end_time);
        let duration = end - start;
        if (duration < 0) duration += 24 * 60;
        return weekSum + (duration * c.days_of_week.length);
    }, 0);

    const avgAnchorMinutes = Math.round(anchorMinutesPerWeek / 7);

    // 3. Bio-Overhead (Meals + Wind Down + Buffer)
    // Estimate: 3 meals (90m) + WindDown (45m) + Buffer (10%)
    const bioOverhead = 135;

    const maxCapacity = Math.max(0, wakeMinutes - avgAnchorMinutes - bioOverhead);
    const isOverCapacity = totalMinutes > maxCapacity;
    const capacityPercentage = Math.round((totalMinutes / maxCapacity) * 100);

    // Inline Update Handler (Auto-save)
    const handleUpdate = async (id: string, updates: Partial<Goal>) => {
        // Optimistic
        updateGoal(id, updates);
        // DB
        await supabase.from('goals').update(updates).eq('id', id);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this goal?')) return;
        removeGoal(id);
        await supabase.from('goals').delete().eq('id', id);
    };

    return (
        <div className="space-y-8 pb-20">
            {/* 1. Header */}
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-heading text-gradient">Goals</h1>
                    <p className="text-caption">Where your time is going</p>
                </div>
                <div className="flex gap-2">
                    <GlassButton variant="ghost" onClick={() => setClearingGoals(true)}>
                        <MoreVertical className="w-4 h-4" />
                    </GlassButton>
                    <GlassButton variant="ghost" onClick={() => setCreatingAnchor(true)}>
                        <Anchor className="w-4 h-4 mr-2" /> Commitment
                    </GlassButton>
                    <GlassButton variant="primary" onClick={() => setIsAdding(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Add Goal
                    </GlassButton>
                </div>
            </header>

            {/* 2. Total Commitment Bar */}
            <GlassCard padding="md" className="relative overflow-hidden">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <span className="text-3xl font-bold font-mono">{totalMinutes}</span>
                        <span className="text-sm text-[var(--text-tertiary)] ml-1">min / day</span>
                    </div>
                    <div className="text-right">
                        <span className={`text-xs font-bold ${isOverCapacity ? 'text-[var(--color-error)]' : 'text-[var(--text-tertiary)]'}`}>
                            {capacityPercentage}% Capacity
                        </span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-[var(--glass-border)] rounded-full overflow-hidden mb-2">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(capacityPercentage, 100)}%` }}
                        className={`h-full ${isOverCapacity ? 'bg-[var(--color-error)]' : 'bg-[var(--color-primary)]'}`}
                    />
                </div>

                {isOverCapacity && (
                    <div className="flex items-start gap-2 text-[var(--color-error)] text-xs bg-[var(--color-error)]/10 p-2 rounded-lg mt-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <p>You’re committing more time than your day allows. PlannrAI will adapt, but your plan will spill over.</p>
                    </div>
                )}
            </GlassCard>

            {/* 3. Pillar Sections */}
            {PILLARS.map(pillar => {
                const pillarGoals = goals.filter(g => g.category === pillar.id && g.status !== 'archived');
                const pillarMinutes = pillarGoals.reduce((sum, g) => sum + (g.status === 'active' ? g.minutes_per_day : 0), 0);

                return (
                    <section key={pillar.id} className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-2">
                                <pillar.icon className="w-4 h-4" style={{ color: pillar.color }} />
                                <h2 className="text-subheading">{pillar.label}</h2>
                            </div>
                            <span className="text-caption font-mono">{pillarMinutes}m</span>
                        </div>

                        <div className="space-y-3">
                            {pillarGoals.map(goal => (
                                <GoalCard
                                    key={goal.id}
                                    goal={goal}
                                    isExpanded={expandedGoalId === goal.id}
                                    onExpand={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
                                    onUpdate={(updates) => handleUpdate(goal.id, updates)}
                                    onDelete={() => handleDelete(goal.id)}
                                    onStrategy={() => setSelectedStrategyGoal(goal)}
                                    pillarColor={pillar.color}
                                />
                            ))}
                            {pillarGoals.length === 0 && (
                                <div className="p-4 border border-dashed border-[var(--glass-border)] rounded-xl text-center text-caption">
                                    No goals in {pillar.label}
                                </div>
                            )}
                        </div>
                    </section>
                );
            })}

            {/* Add Goal Modal (Shared Component Placeholder) */}
            <AnimatePresence>
                {isAdding && (
                    <AddGoalModal onClose={() => setIsAdding(false)} />
                )}
                {creatingAnchor && (
                    <CommitmentModal onClose={() => setCreatingAnchor(false)} />
                )}
                {clearingGoals && (
                    <ClearGoalsDialog onClose={() => setClearingGoals(false)} />
                )}
                {selectedStrategyGoal && (
                    <GoalStrategyModal
                        goal={selectedStrategyGoal}
                        isOpen={true}
                        onClose={() => setSelectedStrategyGoal(null)}
                    />
                )}
            </AnimatePresence>

        </div>
    );
}

// ------------------------------------------------------------------
// Sub-components (Inline for now, can move to separate files)
// ------------------------------------------------------------------

function GoalCard({ goal, isExpanded, onExpand, onUpdate, onDelete, onStrategy, pillarColor }: {
    goal: Goal;
    isExpanded: boolean;
    onExpand: () => void;
    onUpdate: (u: Partial<Goal>) => void;
    onDelete: () => void;
    onStrategy: () => void;
    pillarColor: string;
}) {
    const isPaused = goal.status === 'paused';

    return (
        <div className={`glass-card overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-1 ring-[var(--color-primary)]' : ''}`}>
            {/* Summary Row */}
            <div
                onClick={onExpand}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--glass-bg-hover)] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full`} style={{ backgroundColor: isPaused ? 'var(--text-disabled)' : pillarColor }} />
                    <div>
                        <h3 className={`font-medium ${isPaused ? 'text-[var(--text-tertiary)] line-through' : ''}`}>{goal.title}</h3>
                        {!isExpanded && (
                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">
                                <span>{goal.minutes_per_day}m</span>
                                <span>·</span>
                                <span>{goal.energy_demand}</span>
                                {isPaused && <span className="text-[var(--color-warning)]">· Paused</span>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onStrategy(); }}
                        className="p-1.5 rounded-full hover:bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        title="Consult Expert"
                    >
                        <Sparkles className="w-4 h-4" />
                    </button>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${goal.importance === 'high' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--glass-border)] text-[var(--text-tertiary)]'
                        }`}>
                        {goal.importance}
                    </span>
                </div>
            </div>

            {/* Expanded Inline Editor */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]"
                    >
                        <div className="p-4 space-y-4">
                            {/* Title Edit */}
                            <GlassInput
                                value={goal.title}
                                onChange={(e) => onUpdate({ title: e.target.value })}
                                className="font-bold"
                            />

                            {/* AI Strategy Button (Large) */}
                            <GlassButton
                                variant="ghost"
                                className="w-full justify-center border border-dashed border-[var(--color-primary)]/30 text-[var(--color-primary)]"
                                onClick={onStrategy}
                            >
                                <Sparkles className="w-4 h-4 mr-2" />
                                Open Expert Strategy
                            </GlassButton>

                            {/* Sliders & Selectors */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-[var(--text-tertiary)]">Duration (min)</label>
                                    <input
                                        type="range" min={5} max={180} step={5}
                                        value={goal.minutes_per_day}
                                        onChange={(e) => onUpdate({ minutes_per_day: Number(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)]"
                                    />
                                    <div className="text-right text-xs font-mono">{goal.minutes_per_day}m</div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-[var(--text-tertiary)]">Frequency (days/wk)</label>
                                    <input
                                        type="range" min={1} max={7} step={1}
                                        value={goal.days_per_week || 7}
                                        onChange={(e) => onUpdate({ days_per_week: Number(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)]"
                                    />
                                    <div className="text-right text-xs font-mono">{(goal.days_per_week || 7)}d / wk</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-[var(--text-tertiary)]">Energy</label>
                                    <div className="flex gap-1">
                                        {(['light', 'medium', 'heavy'] as EnergyDemand[]).map(e => (
                                            <button
                                                key={e}
                                                onClick={() => onUpdate({ energy_demand: e })}
                                                className={`flex-1 text-xs py-1 rounded ${goal.energy_demand === e ? 'bg-[var(--glass-border)] text-white' : 'text-[var(--text-tertiary)]'}`}
                                            >
                                                {e}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-[var(--text-tertiary)]">Priority</label>
                                    <div className="flex gap-1">
                                        {(['low', 'medium', 'high'] as GoalImportance[]).map(p => (
                                            <button
                                                key={p}
                                                onClick={() => onUpdate({ importance: p })}
                                                className={`flex-1 text-xs py-1 rounded ${goal.importance === p ? 'bg-[var(--glass-border)] text-white' : 'text-[var(--text-tertiary)]'}`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-between items-center pt-2 border-t border-[var(--glass-border)]">
                                <button
                                    onClick={() => onUpdate({ status: isPaused ? 'active' : 'paused' })}
                                    className="flex items-center gap-2 text-xs font-medium hover:text-[var(--color-primary)] transition-colors"
                                >
                                    {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                                    {isPaused ? 'Resume Goal' : 'Pause Goal'}
                                </button>
                                <button
                                    onClick={onDelete}
                                    className="flex items-center gap-2 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--color-error)] transition-colors"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}




