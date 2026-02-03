'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import {
    Sparkles,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    Target,
    Zap,
    RefreshCw,
    X,
    Play,
    Flag
} from 'lucide-react';
import type { GoalAIPlan } from '@/types/database';

interface GoalInterpretProps {
    goalId: string;
    goalTitle: string;
    onClose?: () => void;
    onApply?: (plan: GoalAIPlan) => void;
}

export function GoalInterpret({ goalId, goalTitle, onClose, onApply }: GoalInterpretProps) {
    const [plan, setPlan] = useState<GoalAIPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedSection, setExpandedSection] = useState<string | null>('routine');

    useEffect(() => {
        fetchPlan();
    }, [goalId]);

    const fetchPlan = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/ai/decompose-goal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goal: goalTitle,
                    minutes: 30, // Default constraint, could be dynamic later
                    goalId: goalId // Auto-save to DB
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to generate plan');
                return;
            }

            if (data.plan) {
                setPlan(data.plan);
            } else {
                setError('No plan generated');
            }
        } catch (err) {
            console.error('Goal plan error:', err);
            setError('Failed to connect to AI service');
        } finally {
            setLoading(false);
        }
    }, [goalId, goalTitle]);

    const toggleSection = (section: string) => {
        setExpandedSection(prev => prev === section ? null : section);
    };

    const handleApply = () => {
        if (plan && onApply) {
            onApply(plan);
        }
    };

    if (loading) {
        return (
            <GlassCard variant="glow" padding="lg" className="text-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-16 h-16 mx-auto mb-4"
                >
                    <Sparkles className="w-full h-full text-[var(--color-primary)]" />
                </motion.div>
                <p className="font-medium mb-1">Strategies Loading...</p>
                <p className="text-sm text-[var(--text-tertiary)]">
                    Designing a zero-to-one progression for &quot;{goalTitle}&quot;
                </p>
            </GlassCard>
        );
    }

    if (error) {
        return (
            <GlassCard padding="lg" className="text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <GlassButton onClick={() => fetchPlan()} variant="ghost">
                    <RefreshCw className="w-4 h-4" /> Try Again
                </GlassButton>
            </GlassCard>
        );
    }

    if (!plan) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
        >
            {/* Header: Strategic Overview */}
            <GlassCard variant="glow" padding="md" className="border-l-4 border-[var(--color-primary)]">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                            {plan.daily_routine.name}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-1 italic">
                            &quot;{plan.advice}&quot;
                        </p>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg">
                            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                        </button>
                    )}
                </div>
            </GlassCard>

            {/* Daily Routine: The "How" */}
            <GlassCard padding="md">
                <button
                    onClick={() => toggleSection('routine')}
                    className="w-full flex items-center justify-between"
                >
                    <div className="flex items-center gap-2">
                        <Play className="w-5 h-5 text-[var(--color-accent-body)]" />
                        <span className="font-medium">Daily Drill ({plan.daily_routine.total_mins}m)</span>
                    </div>
                    {expandedSection === 'routine' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                <AnimatePresence>
                    {expandedSection === 'routine' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-3 space-y-3"
                        >
                            {plan.daily_routine.blocks.map((block, i) => (
                                <div key={i} className="flex gap-3 p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-[var(--glass-bg-hover)] flex-shrink-0">
                                        <span className="text-xs font-bold">{block.duration_mins}m</span>
                                        <span className="text-[10px] uppercase opacity-60">{block.type}</span>
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm">{block.name}</p>
                                        <p className="text-xs text-[var(--text-tertiary)] mt-1">{block.tips}</p>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </GlassCard>

            {/* Progression Phases: The "When" */}
            <GlassCard padding="md">
                <button
                    onClick={() => toggleSection('phases')}
                    className="w-full flex items-center justify-between"
                >
                    <div className="flex items-center gap-2">
                        <Flag className="w-5 h-5 text-[var(--color-accent-mind)]" />
                        <span className="font-medium">Progression Ladder</span>
                    </div>
                    {expandedSection === 'phases' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                <AnimatePresence>
                    {expandedSection === 'phases' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-3 space-y-4"
                        >
                            <div className="relative pl-4 border-l-2 border-[var(--glass-border)] space-y-6">
                                {plan.phases.map((phase, i) => (
                                    <div key={i} className="relative">
                                        <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-[var(--color-primary)] border-2 border-[var(--glass-bg-card)]" />
                                        <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-wide mb-1">
                                            Week {phase.week}
                                        </p>
                                        <p className="font-medium text-sm">{phase.focus}</p>
                                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                            Milestone: {phase.milestone}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </GlassCard>

            {/* Subtasks / Setup */}
            {plan.subtasks.length > 0 && (
                <GlassCard padding="md">
                    <button
                        onClick={() => toggleSection('setup')}
                        className="w-full flex items-center justify-between"
                    >
                        <div className="flex items-center gap-2">
                            <Target className="w-5 h-5 text-[var(--color-text-secondary)]" />
                            <span className="font-medium">Setup Checklist</span>
                        </div>
                        {expandedSection === 'setup' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>

                    <AnimatePresence>
                        {expandedSection === 'setup' && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mt-3 space-y-2"
                            >
                                {plan.subtasks.map((task, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-lg hover:bg-[var(--glass-bg)]">
                                        <div className="w-4 h-4 rounded border border-[var(--text-tertiary)] mt-0.5" />
                                        <span>{task}</span>
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </GlassCard>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <GlassButton
                    variant="ghost"
                    onClick={() => fetchPlan()}
                    className="flex-1"
                >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate
                </GlassButton>
                <GlassButton
                    variant="primary"
                    onClick={handleApply}
                    className="flex-1"
                >
                    <Zap className="w-4 h-4" />
                    Adopt This Plan
                </GlassButton>
            </div>
        </motion.div>
    );
}

// Compact trigger for showing AI interpretation
export function GoalInterpretTrigger({
    goalId,
    goalTitle,
    hasInterpretation,
    onOpen,
}: {
    goalId: string;
    goalTitle: string;
    hasInterpretation?: boolean;
    onOpen: () => void;
}) {
    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpen();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${hasInterpretation
                ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.3)]'
                : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--glass-bg-hover)]'
                }`}
        >
            <Sparkles className="w-3 h-3" />
            {hasInterpretation ? 'View Strategy' : 'Get AI Strategy'}
        </button>
    );
}
