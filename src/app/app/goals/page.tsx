'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useGoalsStore, useUserStore } from '@/stores';
import { useToast } from '@/components/ui/toast';
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
    Calendar,
    Loader2,
    Zap, // Energy
    Flag, // Priority
    Play,
    Pause,
    Trash2,
    Save,
    AlertTriangle,
    Anchor,
    MoreVertical,
    RefreshCw
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { Goal } from '@/types/database';

export type GoalCategory = 'mind' | 'body' | 'craft';
export type GoalImportance = 'low' | 'medium' | 'high';
export type EnergyDemand = 'light' | 'medium' | 'heavy';
export type GoalStatus = 'active' | 'paused' | 'archived';

const PILLARS = [
    { id: 'mind' as GoalCategory, label: 'Mind', icon: Brain, color: 'var(--color-mind)', softColor: 'var(--color-mind-soft)' },
    { id: 'body' as GoalCategory, label: 'Body', icon: Dumbbell, color: 'var(--color-body)', softColor: 'var(--color-body-soft)' },
    { id: 'craft' as GoalCategory, label: 'Craft', icon: Briefcase, color: 'var(--color-craft)', softColor: 'var(--color-craft-soft)' },
];

export default function GoalsPage() {
    const supabase = createClient();
    const { goals, setGoals, addGoal, updateGoal, removeGoal, setLoading } = useGoalsStore();
    const { profile } = useUserStore();
    const { showToast } = useToast();

    // UI State
    const [isAdding, setIsAdding] = useState(false);
    const [creatingAnchor, setCreatingAnchor] = useState(false);
    const [clearingGoals, setClearingGoals] = useState(false);
    const [selectedStrategyGoal, setSelectedStrategyGoal] = useState<Goal | null>(null);
    const [pendingReschedule, setPendingReschedule] = useState(false);
    const [isRescheduling, setIsRescheduling] = useState(false);

    // UI State for editing
    const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

    // Data Fetching
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

    // Strict Capacity Logic
    const capacity = useMemo(() => {
        if (!profile) return null;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { calculateGoalCapacity } = require('@/lib/capacity');
        return calculateGoalCapacity(profile, goals, commitments);
    }, [profile, goals, commitments]);

    const capacityPercentage = capacity?.percentage || 0;
    const totalMinutes = capacity?.totalGoalMinutes || 0;
    const isExtremeOverload = capacityPercentage > 120;
    const isOverCapacity = capacityPercentage > 100;

    // Sync Handler — uses PUT /api/goals for proper scheduling integration
    const handleUpdate = async (id: string, updates: Partial<Goal>) => {
        // Optimistic UI Update
        updateGoal(id, updates);

        if ('status' in updates) {
            showToast(updates.status === 'paused' ? '⏸️ Goal paused' : '▶️ Goal resumed', 'info');
        }

        try {
            const result = await apiClient.put<any>('/api/goals', { id, ...updates });
            // If schedule was affected, offer reschedule
            const scheduleFields = ['minutes_per_day', 'status', 'days_per_week', 'importance', 'is_paused'];
            const affectsSchedule = scheduleFields.some(f => f in updates);
            if (affectsSchedule || result?.scheduleChanged) {
                setPendingReschedule(true);
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to save changes', 'error');
        }
    };

    // Reschedule handler
    const handleReschedule = async () => {
        setIsRescheduling(true);
        try {
            const { startOfWeek, format } = await import('date-fns');
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

            const planResult = await apiClient.post<any>('/api/calendar/plan-week', {
                startDate: format(weekStart, 'yyyy-MM-dd'),
            });

            const data = planResult?.data || planResult;
            if (data?.patch?.changes?.length > 0) {
                // Apply the optimized patch
                const patchOps = data.patch.changes.map((c: any) => {
                    if (c.op === 'create_event') return { op: 'create', event: c.payload };
                    if (c.op === 'update_event') return { op: 'update', event_id: c.event_id, fields: c.payload };
                    if (c.op === 'delete_event') return { op: 'delete', event_id: c.event_id };
                    return c;
                });

                await apiClient.post('/api/calendar/apply-patch', {
                    patch: { ops: patchOps, scope: 'week', reason: 'Goal change reschedule' }
                });

                showToast(`✅ Rescheduled: ${data.patch.changes.length} blocks updated`, 'success');
            } else {
                showToast('Schedule is already optimal', 'info');
            }
            setPendingReschedule(false);
        } catch (err: any) {
            console.error('Reschedule failed:', err);
            showToast(err.message || 'Reschedule failed', 'error');
        } finally {
            setIsRescheduling(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this goal?')) return;
        removeGoal(id);

        try {
            await apiClient.post('/api/goals/sync', {
                operation: 'delete',
                goal_id: id
            });
            showToast('🗑️ Goal deleted', 'info');
        } catch (e) {
            console.error(e);
            showToast('Failed to delete goal', 'error');
        }
    };

    const handleReduceIntensity = async () => {
        setIsRescheduling(true);
        try {
            const data = await apiClient.post<any>('/api/coach/chat', {
                message: "I'm overloaded. Please help me reduce my goal intensity to fit my capacity."
            });
            // This will trigger the coach to propose a "reduce_intensity" patch
            if (data.options) {
                showToast("Coach is preparing a reduction plan.", "info");
                // Navigate to coach or show options here? 
                // For now, let's just trigger the intention.
                window.location.href = '/app/coach';
            }
        } catch (e) {
            showToast("Failed to reach coach", "error");
        } finally {
            setIsRescheduling(false);
        }
    };

    // ... rest of component logic ...

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

            {/* Reschedule Banner */}
            <AnimatePresence>
                {pendingReschedule && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <GlassCard padding="sm" className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <RefreshCw className={`w-4 h-4 text-[var(--color-primary)] ${isRescheduling ? 'animate-spin' : ''}`} />
                                    <span className="text-sm font-medium">Goals changed. Reschedule week?</span>
                                </div>
                                <div className="flex gap-2">
                                    <GlassButton variant="ghost" size="sm" onClick={() => setPendingReschedule(false)}>
                                        Dismiss
                                    </GlassButton>
                                    <GlassButton
                                        variant="primary"
                                        size="sm"
                                        onClick={handleReschedule}
                                        disabled={isRescheduling}
                                    >
                                        {isRescheduling ? 'Rescheduling...' : 'Reschedule'}
                                    </GlassButton>
                                </div>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Total Commitment Bar */}
            <GlassCard padding="md" className="relative overflow-hidden">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <span className="text-3xl font-bold font-mono">{totalMinutes}</span>
                        <span className="text-sm text-[var(--text-tertiary)] ml-1">min / day</span>
                    </div>
                    <div className="text-right">
                        <span className={`text-xs font-bold ${isExtremeOverload ? 'text-[var(--color-error)]' : isOverCapacity ? 'text-[var(--color-warning)]' : 'text-[var(--text-tertiary)]'}`}>
                            {capacityPercentage}% Capacity
                        </span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-[var(--glass-border)] rounded-full overflow-hidden mb-2">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(capacityPercentage || 0, 100)}%` }}
                        className={`h-full ${isExtremeOverload ? 'bg-[var(--color-error)]' : isOverCapacity ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-primary)]'}`}
                    />
                </div>

                {(isOverCapacity || isExtremeOverload) && (
                    <div className={`flex flex-col gap-3 p-3 rounded-lg mt-2 ${isExtremeOverload ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'}`}>
                        <div className="flex items-start gap-2 text-xs">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <p>
                                {isExtremeOverload
                                    ? "CRITICAL OVERLOAD: You have committed 120%+ of your daily reality window. This plan is mathematically impossible to sustain."
                                    : "Warning: You are slightly over-committed. Some blocks might be skipped."}
                            </p>
                        </div>
                        {isExtremeOverload && (
                            <GlassButton
                                variant="primary"
                                size="sm"
                                className="w-full bg-[var(--color-error)] hover:bg-[var(--color-error-hover)] border-none"
                                onClick={handleReduceIntensity}
                                disabled={isRescheduling}
                            >
                                <Zap className="w-3 h-3 mr-2" /> Reduce Intensity
                            </GlassButton>
                        )}
                    </div>
                )}
            </GlassCard>


            {/* 3. Pillar Sections */}
            {PILLARS.map(pillar => {
                const pillarGoals = goals.filter(g => g.category === pillar.id && g.status !== 'archived');
                const pillarMinutes = pillarGoals.reduce((sum, g) => sum + (g.status === 'active' ? (g.minutes_per_day || 0) : 0), 0);

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
                                    onAutoSchedule={async (goalId) => {
                                        try {
                                            const data = await apiClient.post<any>('/api/goals/auto-schedule', { goal_id: goalId });

                                            if (data.success && data.proposal) {
                                                // Apply immediately
                                                const applyData = await apiClient.post<any>('/api/calendar/apply-patch', { patch: data.proposal });

                                                if (applyData.success) {
                                                    showToast(`✅ Scheduled ${data.proposal.changes.length} blocks!`, 'success');
                                                } else {
                                                    throw new Error(applyData.error || 'Patch failed');
                                                }
                                            } else {
                                                showToast(data.message || 'Could not find slots.', 'error');
                                            }
                                        } catch (err: any) {
                                            console.error(err);
                                            showToast(err.message || 'Auto-schedule failed', 'error');
                                        }
                                    }}
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
                        onStrategyGenerated={(strategy) => {
                            if (selectedStrategyGoal) {
                                updateGoal(selectedStrategyGoal.id, { ai_strategy: strategy });
                            }
                        }}
                    />
                )}
            </AnimatePresence>

        </div>
    );
}

// ------------------------------------------------------------------
// Sub-components (Inline for now, can move to separate files)
// ------------------------------------------------------------------

function GoalCard({ goal, isExpanded, onExpand, onUpdate, onDelete, onStrategy, pillarColor, onAutoSchedule }: {
    goal: Goal;
    isExpanded: boolean;
    onExpand: () => void;
    onUpdate: (u: Partial<Goal>) => void;
    onDelete: () => void;
    onStrategy: () => void;
    pillarColor: string;
    onAutoSchedule: (goalId: string) => Promise<void>;
}) {
    const isPaused = goal.status === 'paused';
    const [isScheduling, setIsScheduling] = useState(false);

    const handleAutoSchedule = async () => {
        setIsScheduling(true);
        try {
            await onAutoSchedule(goal.id);
        } finally {
            setIsScheduling(false);
        }
    };

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
                        <div className="flex items-center gap-2">
                            <h3 className={`font-medium ${isPaused ? 'text-[var(--text-tertiary)] line-through' : ''}`}>{goal.title}</h3>
                            {goal.ai_strategy && Object.keys(goal.ai_strategy).length > 0 && (
                                <span className="px-1.5 py-0.5 text-[8px] uppercase font-bold bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded" title="AI Strategy Active">
                                    AI
                                </span>
                            )}
                        </div>
                        {!isExpanded && (
                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">
                                <span>{goal.minutes_per_day}m</span>
                                <span>·</span>
                                <span>{goal.energy_demand}</span>
                                {isPaused && <span className="text-[var(--color-warning)]">· Paused</span>}
                                {(goal.ai_strategy as any)?.strategy_one_liner && (
                                    <span className="text-[var(--color-primary)] truncate max-w-[150px]" title={(goal.ai_strategy as any).strategy_one_liner}>
                                        · "{(goal.ai_strategy as any).strategy_one_liner.slice(0, 20)}..."
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onStrategy(); }}
                        className={`p-1.5 rounded-full transition-all ${goal.ai_strategy && Object.keys(goal.ai_strategy).length > 0
                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary)] animate-pulse'
                            : 'hover:bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                            }`}
                        title={goal.ai_strategy ? "View Expert Strategy" : "Generate Strategy"}
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
                            {/* AI Strategy & Auto-Schedule Buttons */}
                            <div className="flex gap-2">
                                <GlassButton
                                    variant="ghost"
                                    className="flex-1 justify-center border border-dashed border-[var(--color-primary)]/30 text-[var(--color-primary)]"
                                    onClick={onStrategy}
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Expert Strategy
                                </GlassButton>
                                <GlassButton
                                    variant="primary"
                                    className="flex-1 justify-center"
                                    onClick={handleAutoSchedule}
                                    disabled={isScheduling}
                                >
                                    {isScheduling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
                                    {isScheduling ? 'Scheduling...' : 'Auto Schedule'}
                                </GlassButton>
                            </div>

                            {/* Sliders & Selectors */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-[var(--text-tertiary)]">Duration (min)</label>
                                    <input
                                        type="range" min={5} max={180} step={5}
                                        value={goal.minutes_per_day || 0}
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




