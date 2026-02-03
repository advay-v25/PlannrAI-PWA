'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { useHabitStacksStore } from '@/stores';
import { habitStacksApi, type HabitStack } from '@/lib/api-client';
import {
    Link as LinkIcon,
    Plus,
    X,
    Check,
    Flame,
    Trophy,
    Clock,
    ChevronRight,
    Sparkles,
} from 'lucide-react';

/**
 * Habit Stack Card - Individual habit stack with completion
 */
interface HabitStackCardProps {
    stack: HabitStack;
    onComplete?: () => void;
    onDelete?: () => void;
}

export function HabitStackCard({ stack, onComplete, onDelete }: HabitStackCardProps) {
    const [isCompleting, setIsCompleting] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);
    const { completeStack, updateStack } = useHabitStacksStore();

    const isCompletedToday = stack.last_completed === new Date().toISOString().split('T')[0];

    const handleComplete = async () => {
        if (isCompletedToday || isCompleting) return;

        setIsCompleting(true);

        try {
            const result = await habitStacksApi.complete(stack.id);

            if (result.success && result.data) {
                updateStack(stack.id, result.data.stack);

                // Show celebration for new records
                if (result.data.streakInfo?.isNewRecord) {
                    setShowCelebration(true);
                    setTimeout(() => setShowCelebration(false), 2000);
                }

                onComplete?.();
            }
        } catch (error) {
            console.error('Failed to complete habit stack:', error);
        } finally {
            setIsCompleting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
        >
            {/* Celebration overlay */}
            <AnimatePresence>
                {showCelebration && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 flex items-center justify-center z-10 bg-[var(--color-bg-primary)]/80 rounded-2xl"
                    >
                        <div className="text-center">
                            <Trophy className="w-12 h-12 text-[var(--color-future)] mx-auto mb-2" />
                            <p className="font-semibold text-[var(--color-future)]">New Record!</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`glass-card p-4 ${isCompletedToday ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-4">
                    {/* Complete Button */}
                    <motion.button
                        onClick={handleComplete}
                        disabled={isCompletedToday || isCompleting}
                        className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isCompletedToday
                                ? 'bg-[var(--color-success)] text-white'
                                : 'bg-[var(--glass-bg)] hover:bg-[var(--color-success-soft)] text-[var(--text-tertiary)]'
                            }`}
                        whileHover={{ scale: isCompletedToday ? 1 : 1.05 }}
                        whileTap={{ scale: isCompletedToday ? 1 : 0.95 }}
                    >
                        {isCompletedToday ? (
                            <Check className="w-6 h-6" />
                        ) : (
                            <LinkIcon className="w-5 h-5" />
                        )}
                    </motion.button>

                    {/* Stack Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                            <span>After</span>
                            <span className="font-medium text-[var(--text-primary)]">{stack.trigger_habit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-[var(--color-primary)]" />
                            <span className="font-medium">{stack.action_habit}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                                ({stack.action_duration_mins}m)
                            </span>
                        </div>
                    </div>

                    {/* Streak */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--glass-bg)]">
                        <Flame className={`w-4 h-4 ${stack.current_streak > 0 ? 'text-orange-500' : 'text-[var(--text-tertiary)]'}`} />
                        <span className="text-sm font-semibold">{stack.current_streak}</span>
                    </div>
                </div>

                {/* Streak Info */}
                {stack.longest_streak > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--glass-border)] flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                        <span>Best: {stack.longest_streak} days</span>
                        <span>Total: {stack.total_completions} times</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

/**
 * Create Habit Stack Form
 */
interface CreateHabitStackProps {
    goalId?: string;
    onCreated?: (stack: HabitStack) => void;
    onCancel?: () => void;
}

export function CreateHabitStack({ goalId, onCreated, onCancel }: CreateHabitStackProps) {
    const [triggerHabit, setTriggerHabit] = useState('');
    const [actionHabit, setActionHabit] = useState('');
    const [duration, setDuration] = useState(5);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addStack } = useHabitStacksStore();

    const TRIGGER_SUGGESTIONS = [
        'After morning coffee',
        'After brushing teeth',
        'After lunch',
        'When I sit at my desk',
        'After dinner',
        'Before bed',
    ];

    const handleSubmit = async () => {
        if (!triggerHabit.trim() || !actionHabit.trim()) return;

        setIsSubmitting(true);

        try {
            const result = await habitStacksApi.create({
                trigger_habit: triggerHabit.trim(),
                action_habit: actionHabit.trim(),
                goal_id: goalId,
                action_duration_mins: duration,
            });

            if (result.success && result.data?.stack) {
                addStack(result.data.stack);
                onCreated?.(result.data.stack);
                setTriggerHabit('');
                setActionHabit('');
                setDuration(5);
            }
        } catch (error) {
            console.error('Failed to create habit stack:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
        >
            <div className="glass-card glass-primary p-5 space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-heading flex items-center gap-2">
                        <LinkIcon className="w-5 h-5 text-[var(--color-primary)]" />
                        Create Habit Stack
                    </h3>
                    {onCancel && (
                        <button onClick={onCancel} className="p-2 rounded-full hover:bg-[var(--glass-bg)]">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Trigger */}
                <div className="space-y-2">
                    <label className="text-overline">After I...</label>
                    <GlassInput
                        placeholder="e.g., finish my morning coffee"
                        value={triggerHabit}
                        onChange={(e) => setTriggerHabit(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        {TRIGGER_SUGGESTIONS.map((suggestion) => (
                            <button
                                key={suggestion}
                                onClick={() => setTriggerHabit(suggestion)}
                                className="text-xs px-2 py-1 rounded-full bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Action */}
                <div className="space-y-2">
                    <label className="text-overline">I will...</label>
                    <GlassInput
                        placeholder="e.g., meditate for 5 minutes"
                        value={actionHabit}
                        onChange={(e) => setActionHabit(e.target.value)}
                    />
                </div>

                {/* Duration */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-overline">Duration</label>
                        <span className="text-sm font-medium text-[var(--color-primary)]">{duration} min</span>
                    </div>
                    <input
                        type="range"
                        min={1}
                        max={30}
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value))}
                        className="w-full h-2 bg-[var(--glass-bg)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)]"
                    />
                </div>

                <GlassButton
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={!triggerHabit.trim() || !actionHabit.trim()}
                    loading={isSubmitting}
                    className="w-full"
                >
                    <Sparkles className="w-4 h-4" />
                    Create Stack
                </GlassButton>
            </div>
        </motion.div>
    );
}

/**
 * Habit Stacks List - Shows all habit stacks
 */
export function HabitStacksList() {
    const [isCreating, setIsCreating] = useState(false);
    const { stacks, setStacks, setLoading, isLoading } = useHabitStacksStore();

    useEffect(() => {
        async function loadStacks() {
            try {
                const result = await habitStacksApi.list();
                if (result.success && result.data?.stacks) {
                    setStacks(result.data.stacks);
                }
            } catch (error) {
                console.error('Failed to load habit stacks:', error);
            } finally {
                setLoading(false);
            }
        }

        loadStacks();
    }, [setStacks, setLoading]);

    // Today's stacks (not yet completed today)
    const todaysStacks = stacks.filter(s =>
        s.is_active && s.last_completed !== new Date().toISOString().split('T')[0]
    );
    const completedToday = stacks.filter(s =>
        s.is_active && s.last_completed === new Date().toISOString().split('T')[0]
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-heading">Habit Stacks</h3>
                    <p className="text-caption">
                        {completedToday.length} of {stacks.filter(s => s.is_active).length} completed today
                    </p>
                </div>
                <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreating(true)}
                >
                    <Plus className="w-4 h-4" />
                    Add
                </GlassButton>
            </div>

            {/* Create Form */}
            <AnimatePresence>
                {isCreating && (
                    <CreateHabitStack
                        onCreated={() => setIsCreating(false)}
                        onCancel={() => setIsCreating(false)}
                    />
                )}
            </AnimatePresence>

            {/* Today's Stacks */}
            {todaysStacks.length > 0 && (
                <div className="space-y-3">
                    {todaysStacks.map((stack) => (
                        <HabitStackCard key={stack.id} stack={stack} />
                    ))}
                </div>
            )}

            {/* Completed Today */}
            {completedToday.length > 0 && (
                <div className="space-y-3">
                    <p className="text-overline text-[var(--color-success)]">✓ Completed today</p>
                    {completedToday.map((stack) => (
                        <HabitStackCard key={stack.id} stack={stack} />
                    ))}
                </div>
            )}

            {/* Empty State */}
            {stacks.length === 0 && !isLoading && !isCreating && (
                <div className="glass-card p-8 text-center">
                    <LinkIcon className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                    <h4 className="font-medium mb-2">No habit stacks yet</h4>
                    <p className="text-caption mb-4">
                        Link new habits to existing ones for easy adoption
                    </p>
                    <GlassButton variant="primary" onClick={() => setIsCreating(true)}>
                        <Plus className="w-4 h-4" />
                        Create First Stack
                    </GlassButton>
                </div>
            )}
        </div>
    );
}
