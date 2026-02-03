'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useGoalsStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { GoalInterpret, GoalInterpretTrigger } from '@/components/goal-interpret';
import {
    Target,
    Plus,
    X,
    ChevronRight,
    ChevronDown,
    Pause,
    Play,
    Brain,
    Dumbbell,
    Rocket,
    Sparkles,
    Clock,
    CheckCircle2,
    Circle,
    GripVertical,
    Trash2,
} from 'lucide-react';
import type { Goal, GoalCategory, GoalImportance } from '@/types/database';

const CATEGORIES = [
    { id: 'mind' as GoalCategory, label: 'Mind', icon: Brain, color: 'var(--color-mind)', softColor: 'var(--color-mind-soft)' },
    { id: 'body' as GoalCategory, label: 'Body', icon: Dumbbell, color: 'var(--color-body)', softColor: 'var(--color-body-soft)' },
    { id: 'future' as GoalCategory, label: 'Future', icon: Rocket, color: 'var(--color-future)', softColor: 'var(--color-future-soft)' },
];

interface GoalWithSubtasks extends Goal {
    subtasks?: Goal[];
    isExpanded?: boolean;
}

export default function GoalsPage() {
    const supabase = createClient();
    const { goals, setGoals, addGoal, updateGoal, removeGoal, togglePause, setLoading } = useGoalsStore();
    const [isAdding, setIsAdding] = useState(false);
    const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
    const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
    const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
    const [interpretingGoal, setInterpretingGoal] = useState<Goal | null>(null);
    const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

    const [newGoal, setNewGoal] = useState({
        title: '',
        category: 'mind' as GoalCategory,
        minutes_per_day: 30,
        importance: 'medium' as GoalImportance,
        notes: '',
    });

    useEffect(() => {
        async function loadGoals() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', user.id)
                .order('sort_order', { ascending: true });

            if (data) setGoals(data);
            setLoading(false);
        }

        loadGoals();
    }, [supabase, setGoals, setLoading]);

    // Organize goals into hierarchy
    const organizedGoals = goals.reduce((acc, goal) => {
        if (!goal.parent_id) {
            acc.push({
                ...goal,
                subtasks: goals.filter(g => g.parent_id === goal.id),
                isExpanded: expandedGoals.has(goal.id),
            });
        }
        return acc;
    }, [] as GoalWithSubtasks[]);

    const handleAddGoal = async (parentId?: string) => {
        if (!newGoal.title.trim()) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('goals')
            .insert({
                user_id: user.id,
                title: newGoal.title,
                category: newGoal.category,
                minutes_per_day: newGoal.minutes_per_day,
                importance: newGoal.importance,
                parent_id: parentId || null,
            })
            .select()
            .single();

        if (data && !error) {
            addGoal(data);
            setNewGoal({ title: '', category: 'mind', minutes_per_day: 30, importance: 'medium', notes: '' });
            setIsAdding(false);
            setAddingSubtaskFor(null);
            if (parentId) {
                setExpandedGoals(prev => new Set([...prev, parentId]));
            }
        }
    };

    const handleTogglePause = async (goal: Goal) => {
        togglePause(goal.id);
        await supabase
            .from('goals')
            .update({ is_paused: !goal.is_paused })
            .eq('id', goal.id);
    };

    const handleDeleteGoal = async (id: string) => {
        removeGoal(id);
        await supabase.from('goals').delete().eq('id', id);
    };

    const handleUpdateGoal = async () => {
        if (!editingGoal || !newGoal.title.trim()) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const updates = {
            title: newGoal.title,
            category: newGoal.category,
            minutes_per_day: newGoal.minutes_per_day,
            importance: newGoal.importance,
            notes: newGoal.notes || undefined,
        };

        const { error } = await supabase
            .from('goals')
            .update(updates)
            .eq('id', editingGoal.id);

        if (!error) {
            updateGoal(editingGoal.id, updates);
            setEditingGoal(null);
            setNewGoal({ title: '', category: 'mind', minutes_per_day: 30, importance: 'medium', notes: '' });
        }
    };

    const openEditModal = (goal: Goal) => {
        setNewGoal({
            title: goal.title,
            category: goal.category,
            minutes_per_day: goal.minutes_per_day,
            importance: goal.importance,
            notes: goal.notes || '',
        });
        setEditingGoal(goal);
    };

    const toggleExpanded = (goalId: string) => {
        setExpandedGoals(prev => {
            const next = new Set(prev);
            if (next.has(goalId)) {
                next.delete(goalId);
            } else {
                next.add(goalId);
            }
            return next;
        });
    };

    // Stats
    const activeGoals = organizedGoals.filter(g => !g.is_paused);
    const totalMinutes = activeGoals.reduce((sum, g) => sum + g.minutes_per_day, 0);
    const completedSubtasks = goals.filter(g => g.parent_id && g.milestone_progress === 100).length;
    const totalSubtasks = goals.filter(g => g.parent_id).length;

    return (
        <div className="space-y-8">
            {/* Premium Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-primary)]/10 via-[var(--color-mind)]/5 to-transparent rounded-3xl blur-2xl" />

                <div className="relative glass-card p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-title text-gradient mb-1">Goals</h1>
                            <p className="text-caption">
                                {activeGoals.length} active · {totalMinutes} min/day
                            </p>
                        </div>

                        <GlassButton
                            variant="primary"
                            onClick={() => setIsAdding(true)}
                            className="shadow-lg"
                        >
                            <Plus className="w-4 h-4" />
                            New Goal
                        </GlassButton>
                    </div>

                    {/* Quick Stats */}
                    <div className="flex gap-4 mt-6">
                        <div className="flex-1 glass p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center">
                                    <Target className="w-5 h-5 text-[var(--color-primary)]" />
                                </div>
                                <div>
                                    <p className="text-2xl font-semibold">{activeGoals.length}</p>
                                    <p className="text-xs text-[var(--text-tertiary)]">Active Goals</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 glass p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[var(--color-success-soft)] flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
                                </div>
                                <div>
                                    <p className="text-2xl font-semibold">{completedSubtasks}/{totalSubtasks || '—'}</p>
                                    <p className="text-xs text-[var(--text-tertiary)]">Subtasks Done</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Add Goal Wizard Modal */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                        onClick={() => setIsAdding(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 20, opacity: 0 }}
                            className="w-full max-w-lg overflow-hidden glass-card glass-primary relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Decorative Background */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-primary)]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                            <div className="p-8 space-y-8 relative z-10">
                                <div className="text-center">
                                    <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-secondary)]">
                                        Manifest a New Goal
                                    </h3>
                                    <p className="text-[var(--color-text-secondary)] mt-1">
                                        Define your aspiration and commitment
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    {/* Identity */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium ml-1">What is your goal?</label>
                                        <GlassInput
                                            placeholder="e.g. Run a Marathon, Learn to Code..."
                                            value={newGoal.title}
                                            onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                                            className="text-lg"
                                            autoFocus
                                        />
                                    </div>

                                    {/* Category Pills */}
                                    <div className="grid grid-cols-3 gap-3">
                                        {CATEGORIES.map((cat) => {
                                            const Icon = cat.icon;
                                            const isSelected = newGoal.category === cat.id;
                                            return (
                                                <button
                                                    key={cat.id}
                                                    onClick={() => setNewGoal({ ...newGoal, category: cat.id })}
                                                    className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-300 ${isSelected
                                                        ? 'bg-[var(--glass-bg-active)] shadow-lg ring-1 ring-[var(--glass-border)]'
                                                        : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] opacity-70 hover:opacity-100'
                                                        }`}
                                                >
                                                    <div
                                                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isSelected ? 'scale-110' : ''}`}
                                                        style={{ backgroundColor: isSelected ? cat.softColor : 'transparent' }}
                                                    >
                                                        <Icon className="w-5 h-5" style={{ color: isSelected ? cat.color : 'var(--text-secondary)' }} />
                                                    </div>
                                                    <span className="text-xs font-medium" style={{ color: isSelected ? cat.color : 'var(--text-secondary)' }}>
                                                        {cat.label}
                                                    </span>
                                                    {isSelected && (
                                                        <motion.div layoutId="active-ring" className="absolute inset-0 rounded-2xl border-2 border-[var(--color-primary)]/30" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Time Dial (Visual Slider) */}
                                    <div className="bg-[var(--glass-bg)] p-5 rounded-2xl space-y-4 border border-[var(--glass-border)]">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                                                <span className="text-sm font-medium">Daily Investment</span>
                                            </div>
                                            <span className="text-xl font-bold text-[var(--color-primary)] font-mono">
                                                {newGoal.minutes_per_day}m
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={5}
                                            max={180}
                                            step={5}
                                            value={newGoal.minutes_per_day}
                                            onChange={(e) => setNewGoal({ ...newGoal, minutes_per_day: parseInt(e.target.value) })}
                                            className="w-full h-2 bg-[var(--glass-border)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)] hover:accent-[var(--color-primary-hover)] transition-all"
                                        />
                                        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-wider">
                                            <span>Quick (5m)</span>
                                            <span>Focus (1h)</span>
                                            <span>Deep (3h)</span>
                                        </div>
                                    </div>

                                    {/* Priority Toggle */}
                                    <div className="flex bg-[var(--glass-bg)] p-1 rounded-xl border border-[var(--glass-border)]">
                                        {(['low', 'medium', 'high'] as GoalImportance[]).map((imp) => {
                                            const isSelected = newGoal.importance === imp;
                                            return (
                                                <button
                                                    key={imp}
                                                    onClick={() => setNewGoal({ ...newGoal, importance: imp })}
                                                    className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${isSelected
                                                        ? 'bg-[var(--glass-bg-active)] text-[var(--color-text-primary)] shadow-sm'
                                                        : 'text-[var(--text-secondary)] hover:text-[var(--color-text-primary)]'
                                                        }`}
                                                >
                                                    {imp}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <GlassButton
                                        variant="ghost"
                                        onClick={() => setIsAdding(false)}
                                        className="flex-1"
                                    >
                                        Discard
                                    </GlassButton>
                                    <GlassButton
                                        variant="primary"
                                        onClick={() => handleAddGoal()}
                                        disabled={!newGoal.title.trim()}
                                        className="flex-[2] py-6 text-lg shadow-xl shadow-[var(--color-primary)]/20"
                                    >
                                        <Sparkles className="w-5 h-5 mr-2" />
                                        Commit to Goal
                                    </GlassButton>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Goals List */}
            <div className="space-y-4">
                {organizedGoals.map((goal, index) => {
                    const category = CATEGORIES.find(c => c.id === goal.category)!;
                    const Icon = category.icon;
                    const hasSubtasks = goal.subtasks && goal.subtasks.length > 0;
                    const completedCount = goal.subtasks?.filter(s => s.milestone_progress === 100).length || 0;

                    return (
                        <motion.div
                            key={goal.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <div className={`glass-card overflow-hidden ${goal.is_paused ? 'opacity-50' : ''}`}>
                                {/* Main Goal Row */}
                                <div
                                    className="p-5 flex items-center gap-4 cursor-pointer hover:bg-[var(--glass-bg-hover)] transition-colors"
                                    onClick={() => hasSubtasks && toggleExpanded(goal.id)}
                                >
                                    {/* Category Icon */}
                                    <div
                                        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: category.softColor }}
                                    >
                                        <Icon className="w-6 h-6" style={{ color: category.color }} />
                                    </div>

                                    {/* Goal Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className={`text-subheading truncate ${goal.is_paused ? 'line-through' : ''}`}>
                                                {goal.title}
                                            </h3>
                                            {hasSubtasks && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--glass-bg)] text-[var(--text-tertiary)]">
                                                    {completedCount}/{goal.subtasks?.length}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-caption flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {goal.minutes_per_day} min/day
                                            </span>
                                            <span className="text-caption capitalize">
                                                {goal.importance} priority
                                            </span>
                                            <GoalInterpretTrigger
                                                goalId={goal.id}
                                                goalTitle={goal.title}
                                                hasInterpretation={!!goal.ai_plan}
                                                onOpen={() => setInterpretingGoal(goal)}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <motion.button
                                            onClick={(e) => { e.stopPropagation(); handleTogglePause(goal); }}
                                            className="p-2 rounded-xl hover:bg-[var(--glass-bg)] transition-colors"
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            aria-label={goal.is_paused ? "Resume goal" : "Pause goal"}
                                        >
                                            {goal.is_paused ? (
                                                <Play className="w-4 h-4 text-[var(--color-success)]" />
                                            ) : (
                                                <Pause className="w-4 h-4 text-[var(--text-tertiary)]" />
                                            )}
                                        </motion.button>

                                        {/* Edit button */}
                                        <motion.button
                                            onClick={(e) => { e.stopPropagation(); openEditModal(goal); }}
                                            className="p-2 rounded-xl hover:bg-[var(--glass-bg)] transition-colors"
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            aria-label="Edit goal"
                                        >
                                            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                                        </motion.button>

                                        {/* Delete button */}
                                        <motion.button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteGoal(goal.id);
                                            }}
                                            className="p-2 rounded-xl hover:bg-[var(--color-error-soft)] transition-colors group/delete"
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            aria-label="Delete goal"
                                        >
                                            <Trash2 className="w-4 h-4 text-[var(--text-tertiary)] group-hover/delete:text-[var(--color-error)]" />
                                        </motion.button>

                                        <motion.button
                                            onClick={(e) => { e.stopPropagation(); setAddingSubtaskFor(goal.id); }}
                                            className="p-2 rounded-xl hover:bg-[var(--glass-bg)] transition-colors"
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                        >
                                            <Plus className="w-4 h-4 text-[var(--text-tertiary)]" />
                                        </motion.button>

                                        {hasSubtasks && (
                                            <motion.div
                                                animate={{ rotate: goal.isExpanded ? 90 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                                            </motion.div>
                                        )}
                                    </div>
                                </div>

                                {/* Subtasks */}
                                <AnimatePresence>
                                    {goal.isExpanded && hasSubtasks && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="border-t border-[var(--glass-border)]"
                                        >
                                            <div className="p-4 pl-20 space-y-2">
                                                {goal.subtasks?.map((subtask) => (
                                                    <div
                                                        key={subtask.id}
                                                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-colors"
                                                    >
                                                        <button
                                                            className="flex-shrink-0"
                                                            onClick={() => updateGoal(subtask.id, { milestone_progress: subtask.milestone_progress === 100 ? 0 : 100 })}
                                                        >
                                                            {subtask.milestone_progress === 100 ? (
                                                                <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
                                                            ) : (
                                                                <Circle className="w-5 h-5 text-[var(--text-tertiary)]" />
                                                            )}
                                                        </button>
                                                        <span className={`flex-1 text-sm ${subtask.milestone_progress === 100 ? 'line-through text-[var(--text-tertiary)]' : ''}`}>
                                                            {subtask.title}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteGoal(subtask.id)}
                                                            className="p-1 rounded-lg hover:bg-[var(--color-error-soft)] transition-colors"
                                                        >
                                                            <X className="w-4 h-4 text-[var(--text-tertiary)] hover:text-[var(--color-error)]" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Add Subtask Form */}
                                <AnimatePresence>
                                    {addingSubtaskFor === goal.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-[var(--glass-border)] p-4 pl-20"
                                        >
                                            <div className="flex gap-2">
                                                <GlassInput
                                                    placeholder="Add a subtask..."
                                                    value={newGoal.title}
                                                    onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value, category: goal.category })}
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleAddGoal(goal.id);
                                                        if (e.key === 'Escape') setAddingSubtaskFor(null);
                                                    }}
                                                />
                                                <GlassButton
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleAddGoal(goal.id)}
                                                    disabled={!newGoal.title.trim()}
                                                >
                                                    Add
                                                </GlassButton>
                                                <GlassButton
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setAddingSubtaskFor(null)}
                                                >
                                                    <X className="w-4 h-4" />
                                                </GlassButton>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Empty State */}
            {
                organizedGoals.length === 0 && !isAdding && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="glass-card p-12 text-center">
                            <div className="w-20 h-20 rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center mx-auto mb-6">
                                <Target className="w-10 h-10 text-[var(--color-primary)]" />
                            </div>
                            <h3 className="text-heading mb-2">No goals yet</h3>
                            <p className="text-caption mb-6 max-w-sm mx-auto">
                                Goals help you stay focused on what matters. Start by adding what you want to invest time in.
                            </p>
                            <GlassButton variant="primary" size="lg" onClick={() => setIsAdding(true)}>
                                <Plus className="w-5 h-5" />
                                Create Your First Goal
                            </GlassButton>
                        </div>
                    </motion.div>
                )
            }

            {/* Edit Goal Modal */}
            <AnimatePresence>
                {editingGoal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setEditingGoal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GlassCard padding="lg">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-heading">Edit Goal</h2>
                                    <GlassButton variant="ghost" size="sm" onClick={() => setEditingGoal(null)}>
                                        <X className="w-4 h-4" />
                                    </GlassButton>
                                </div>

                                <div className="space-y-4">
                                    {/* Title */}
                                    <GlassInput
                                        value={newGoal.title}
                                        onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                                        placeholder="Goal title"
                                        autoFocus
                                    />

                                    {/* Category */}
                                    <div className="flex gap-2">
                                        {CATEGORIES.map((cat) => (
                                            <button
                                                key={cat.id}
                                                onClick={() => setNewGoal({ ...newGoal, category: cat.id })}
                                                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${newGoal.category === cat.id
                                                    ? 'bg-[var(--color-primary)] text-white'
                                                    : 'bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                {cat.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Minutes */}
                                    <div>
                                        <label className="text-caption mb-2 block">Minutes per day</label>
                                        <div className="flex gap-2">
                                            {[15, 30, 45, 60, 90].map((mins) => (
                                                <button
                                                    key={mins}
                                                    onClick={() => setNewGoal({ ...newGoal, minutes_per_day: mins })}
                                                    className={`flex-1 py-2 rounded-lg text-sm ${newGoal.minutes_per_day === mins
                                                        ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                                                        : 'bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                                                        }`}
                                                >
                                                    {mins}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Importance */}
                                    <div>
                                        <label className="text-caption mb-2 block">Priority</label>
                                        <div className="flex gap-2">
                                            {(['low', 'medium', 'high'] as const).map((imp) => (
                                                <button
                                                    key={imp}
                                                    onClick={() => setNewGoal({ ...newGoal, importance: imp })}
                                                    className={`flex-1 py-2 rounded-lg text-sm capitalize ${newGoal.importance === imp
                                                        ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                                                        : 'bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                                                        }`}
                                                >
                                                    {imp}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Notes (Context for AI) */}
                                    <div>
                                        <label className="text-caption mb-2 block">Notes for AI (optional)</label>
                                        <textarea
                                            value={newGoal.notes}
                                            onChange={(e) => setNewGoal({ ...newGoal, notes: e.target.value })}
                                            placeholder="Add context for the AI, e.g., &quot;I want to focus on strength training for my lower body&quot;"
                                            className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-3 text-sm resize-none h-24 focus:outline-none focus:border-[var(--color-primary)]"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <GlassButton variant="ghost" className="flex-1" onClick={() => setEditingGoal(null)}>
                                        Cancel
                                    </GlassButton>
                                    <GlassButton
                                        variant="primary"
                                        className="flex-1"
                                        onClick={handleUpdateGoal}
                                        disabled={!newGoal.title.trim()}
                                    >
                                        Save Changes
                                    </GlassButton>
                                </div>
                            </GlassCard>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Goal Interpretation Modal */}
            <AnimatePresence>
                {interpretingGoal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setInterpretingGoal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="w-full max-w-lg max-h-[80vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GoalInterpret
                                goalId={interpretingGoal.id}
                                goalTitle={interpretingGoal.title}
                                onClose={() => setInterpretingGoal(null)}
                                onApply={(plan) => {
                                    // Update goal with AI routine
                                    updateGoal(interpretingGoal.id, { ai_plan: plan });
                                    setInterpretingGoal(null);
                                }}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}

