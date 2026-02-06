
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { AddGoalModal } from '@/components/goals/add-goal-modal';
import { Target, Brain, Dumbbell, Rocket, Plus, X, Check, Sparkles, Zap, Flame, Briefcase } from 'lucide-react';
import type { GoalCategory, GoalImportance } from '@/types/database';

// Preset goals organized by category
const PRESET_GOALS = {
    mind: [
        { title: 'Learn a language', emoji: '🗣️' },
        { title: 'Meditation', emoji: '🧘' },
        { title: 'Read books', emoji: '📚' },
        { title: 'Instrument', emoji: '🎸' },
        { title: 'Coding', emoji: '💻' },
    ],
    body: [
        { title: 'Workout', emoji: '💪' },
        { title: 'Yoga', emoji: '🧘‍♀️' },
        { title: 'Cardio', emoji: '🏃' },
        { title: 'Sleep', emoji: '😴' },
        { title: 'Hydration', emoji: '💧' },
    ],
    craft: [
        { title: 'Side Project', emoji: '🚀' },
        { title: 'Networking', emoji: '🤝' },
        { title: 'Finance', emoji: '💰' },
        { title: 'Course', emoji: '🎓' },
    ],
};

const CATEGORIES = [
    { id: 'mind', label: 'Mind', icon: <Brain className="w-5 h-5" />, color: 'text-purple-400', bg: 'bg-purple-900/20', border: 'border-purple-500/30' },
    { id: 'body', label: 'Body', icon: <Dumbbell className="w-5 h-5" />, color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-500/30' },
    { id: 'craft', label: 'Craft', icon: <Briefcase className="w-5 h-5" />, color: 'text-amber-400', bg: 'bg-amber-900/20', border: 'border-amber-500/30' },
];

export function Step3Goals() {
    const { data, addGoal, removeGoal } = useOnboardingStore();
    const [activeCategory, setActiveCategory] = useState<GoalCategory>('mind');
    const [editingGoal, setEditingGoal] = useState<{ title: string; category: GoalCategory } | null>(null);
    const [customGoalTitle, setCustomGoalTitle] = useState('');

    const [modalData, setModalData] = useState({
        minutes: 30,
        importance: 'medium' as GoalImportance
    });

    const isPresetAdded = (title: string) => data.goals.some(g => g.title === title);

    const handleSelect = (title: string, category: GoalCategory) => {
        if (isPresetAdded(title)) return;
        setEditingGoal({ title, category });
        setModalData({ minutes: 30, importance: 'medium' });
    };

    const handleConfirm = (goalData: any) => {
        addGoal(goalData);
        setEditingGoal(null);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="text-center space-y-2 mb-6">
                <h2 className="text-3xl font-display font-light">Core Ambitions</h2>
                <p className="text-[var(--color-text-secondary)] font-light text-sm">
                    Select directives to integrate into your neural schedule.
                </p>
            </div>

            {/* Category Tabs */}
            <div className="flex justify-center gap-4 mb-8">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id as GoalCategory)}
                        className={`
                            px-6 py-3 rounded-full flex items-center gap-2 transition-all border
                            ${activeCategory === cat.id
                                ? `${cat.bg} ${cat.border} ${cat.color} shadow-[0_0_15px_rgba(0,0,0,0.3)] scale-105`
                                : 'bg-transparent border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--glass-bg)]'
                            }
                        `}
                    >
                        {cat.icon}
                        <span className="font-mono text-xs uppercase tracking-wider">{cat.label}</span>
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">
                {PRESET_GOALS[activeCategory].map((preset, i) => {
                    const added = isPresetAdded(preset.title);
                    return (
                        <motion.button
                            key={preset.title}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => handleSelect(preset.title, activeCategory)}
                            disabled={added}
                            className={`
                                relative p-4 rounded-xl border text-left flex flex-col gap-2 transition-all group
                                ${added
                                    ? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30 opacity-50'
                                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--glass-bg-hover)]'
                                }
                            `}
                        >
                            <span className="text-2xl filter drop-shadow-lg">{preset.emoji}</span>
                            <span className="text-sm font-medium">{preset.title}</span>
                            {added && (
                                <div className="absolute top-2 right-2 text-[var(--color-success)]">
                                    <Check className="w-4 h-4" />
                                </div>
                            )}
                        </motion.button>
                    );
                })}

                {/* Custom Add */}
                <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => {
                        setEditingGoal({ title: '', category: activeCategory });
                        setModalData({ minutes: 30, importance: 'medium' });
                    }}
                    className="p-4 rounded-xl border border-dashed border-[var(--glass-border)] flex flex-col items-center justify-center gap-2 text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-primary)] transition-colors"
                >
                    <Plus className="w-6 h-6" />
                    <span className="text-xs font-mono uppercase">Custom Protocol</span>
                </motion.button>
            </div>

            {/* Selected Summary & Reality Check */}
            {data.goals.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--glass-border)] w-full">
                    <div className="flex flex-wrap gap-2 mb-4">
                        {data.goals.map((goal, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs text-[var(--color-text-secondary)]">
                                {goal.title}
                                <X className="w-3 h-3 cursor-pointer hover:text-red-400" onClick={() => removeGoal(i)} />
                            </span>
                        ))}
                    </div>

                    {/* Reality Check Bar */}
                    <RealityBar data={data} />
                </div>
            )}

            {/* Config Modal (Overlay) */}
            <AnimatePresence>
                {/* Config Modal (Overlay) - Replaced with Shared AddGoalModal */}
                <AnimatePresence>
                    {editingGoal && (
                        <AddGoalModal
                            initialValues={editingGoal}
                            onClose={() => setEditingGoal(null)}
                            onSave={handleConfirm}
                        />
                    )}
                </AnimatePresence>
            </AnimatePresence>
        </div>
    );
}

function RealityBar({ data }: { data: any }) {
    // 1. Calculate Capacity
    // wake (07:00) -> sleep (23:00) = 16h = 960m
    // - Anchors (Approx avg/day)
    // - Meals (3 * 30m = 90m)
    // - Goals (Sum mins)

    // Simplification for Onboarding speed:
    // Assume 16h active base.
    const TOTAL_MINS = 16 * 60;

    const mealMins = (data.meals_per_day || 3) * 30; // 30m per meal approx
    const anchorMins = data.commitments.reduce((sum: number, c: any) => {
        // Simple avg per day calc: duration * (days/7)
        // For onboarding "feel", just summing raw duration of one *instance* is safer to not under-represent "A busy day"
        // Let's sum duration of ALL anchors assuming a "Worst Case Day"
        const [h1, m1] = c.start_time.split(':').map(Number);
        const [h2, m2] = c.end_time.split(':').map(Number);
        const duration = (h2 * 60 + m2) - (h1 * 60 + m1);
        return sum + duration;
    }, 0);

    const goalMins = data.goals.reduce((sum: number, g: any) => sum + g.minutes_per_day, 0);

    const used = mealMins + anchorMins + goalMins;
    const load = used / TOTAL_MINS;

    let statusColor = 'bg-emerald-400';
    let message = "Capacity available. System stable.";

    if (load > 0.8) {
        statusColor = 'bg-orange-400';
        message = "High density detected. Efficient routing required.";
    }
    if (load > 1.0) {
        statusColor = 'bg-red-400';
        message = "Capacity exceeded. I will have to make trade-offs.";
    }

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-[10px] uppercase font-mono text-[var(--color-text-secondary)]">
                <span>Daily Load</span>
                <span>{Math.round(load * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-[var(--glass-border)] rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(load * 100, 100)}%` }}
                    className={`h-full ${statusColor}`}
                />
            </div>
            <p className={`text-xs font-mono ${load > 1 ? 'text-red-300' : 'text-[var(--color-primary)]'} text-center pt-2`}>
                {message}
            </p>
        </div>
    )
}
