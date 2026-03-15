'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useOnboardingStore, OnboardingGoal } from '@/stores';
import { Plus, Settings2, Trash2, Brain, Dumbbell, Paintbrush } from 'lucide-react';

const GOAL_TEMPLATES = {
    mind: [
        { title: 'Reading', minutes: 30 }, { title: 'Meditation', minutes: 15 }, { title: 'Journaling', minutes: 15 },
    ],
    body: [
        { title: 'Gym Workout', minutes: 60 }, { title: 'Running', minutes: 30 }, { title: 'Yoga', minutes: 45 },
    ],
    craft: [
        { title: 'Side Project', minutes: 90 }, { title: 'Coding Practice', minutes: 60 }, { title: 'Writing', minutes: 45 },
    ]
};

const PILLARS = [
    { id: 'mind', label: 'Mind', icon: Brain, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
    { id: 'body', label: 'Body', icon: Dumbbell, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
    { id: 'craft', label: 'Craft', icon: Paintbrush, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
];

export function Step4Goals() {
    const { data, updateData } = useOnboardingStore();
    const [activePillar, setActivePillar] = useState<'mind' | 'body' | 'craft'>('mind');
    const [editingGoalIndex, setEditingGoalIndex] = useState<number | null>(null);

    const addDraftGoal = (title: string, customTitle: boolean = false, target_mins: number = 30) => {
        const newGoal: OnboardingGoal = {
            title,
            pillar: activePillar,
            current_minutes_per_day: 0,
            target_minutes_per_day: target_mins,
            preferred_time_of_day: 'flexible',
            importance: 'high'
        };
        const newIndex = data.goals.length;
        updateData({ goals: [...data.goals, newGoal] });
        if (customTitle) {
            setEditingGoalIndex(newIndex);
        }
    };

    const removeGoal = (index: number) => {
        const next = [...data.goals];
        next.splice(index, 1);
        updateData({ goals: next });
        if (editingGoalIndex === index) setEditingGoalIndex(null);
    };

    const updateGoal = (index: number, updates: Partial<OnboardingGoal>) => {
        const next = [...data.goals];
        next[index] = { ...next[index], ...updates };
        updateData({ goals: next });
    };

    // Calculate capacity roughly (just a visual indicator)
    const totalGoalMins = data.goals.reduce((acc, g) => acc + g.target_minutes_per_day, 0);
    const availableMins = 8 * 60; // Just visual baseline (8 hrs)
    const calcPct = Math.min((totalGoalMins / availableMins) * 100, 100);

    return (
        <div className="flex flex-col items-center justify-start space-y-6 w-full max-w-xl mx-auto pb-20">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                <h2 className="text-3xl font-bold tracking-tight text-white font-mono uppercase">
                    Goal <span className="text-[var(--color-primary)]">Discovery</span>
                </h2>
                <p className="text-[var(--color-text-secondary)] mt-1">
                    Set goals across the three pillars of growth.
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-6">
                
                {/* Pillar Nav */}
                <div className="flex gap-2">
                    {PILLARS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => { setActivePillar(p.id as any); setEditingGoalIndex(null); }}
                            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl transition-all border ${
                                activePillar === p.id 
                                    ? `${p.bg} ${p.border} ${p.color}` 
                                    : 'bg-[var(--glass-surface)] border-[var(--glass-border)] text-gray-500 hover:text-white hover:bg-[var(--bg-card-hover)]'
                            }`}
                        >
                            <p.icon className="w-6 h-6" />
                            <span className="font-mono text-sm tracking-widest uppercase font-bold">{p.label}</span>
                        </button>
                    ))}
                </div>

                {/* Quick Add Area */}
                <div className="bg-[var(--glass-surface)] border border-[var(--glass-border)] p-5 rounded-xl">
                    <p className="text-sm font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">
                        Quick Add {activePillar} Goals
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {GOAL_TEMPLATES[activePillar].map((t, i) => (
                            <button
                                key={i}
                                onClick={() => addDraftGoal(t.title, false, t.minutes)}
                                className="px-4 py-2 rounded-full border border-[var(--glass-border)] hover:bg-[var(--color-primary)] hover:border-[var(--color-primary)] hover:text-black transition-all text-sm whitespace-nowrap"
                            >
                                + {t.title}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => addDraftGoal('', true)}
                        className="mt-4 w-full py-3 border border-dashed border-[var(--glass-border)] hover:border-white rounded-lg flex items-center justify-center gap-2 text-sm text-[var(--color-text-tertiary)] hover:text-white transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Create Custom Goal
                    </button>
                </div>

                {/* Selected Goals List */}
                {data.goals.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-2">
                            <h3 className="text-sm font-bold text-white tracking-widest font-mono uppercase">Your Goals</h3>
                            <span className="bg-[var(--glass-surface)] px-2 py-1 rounded text-xs">{data.goals.length}</span>
                        </div>
                        
                        <div className="space-y-3">
                            {data.goals.map((goal, i) => {
                                const pillarData = PILLARS.find(p => p.id === goal.pillar);
                                const isEditing = editingGoalIndex === i;

                                return (
                                    <div key={i} className={`bg-[var(--bg-card)] border ${isEditing ? 'border-[var(--color-primary)]' : 'border-[var(--glass-border)]'} p-4 rounded-xl transition-all`}>
                                        
                                        {!isEditing ? (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${pillarData?.bg} ${pillarData?.color}`}>
                                                        {pillarData && <pillarData.icon className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-white">{goal.title || 'Untitled Goal'}</div>
                                                        <div className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-2 mt-1">
                                                            <span className="capitalize">{goal.preferred_time_of_day}</span> • 
                                                            <span>Target: {goal.target_minutes_per_day}m/day</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingGoalIndex(i)} className="p-2 text-gray-400 hover:text-white hover:bg-[var(--glass-surface)] rounded-md">
                                                        <Settings2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => removeGoal(i)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-md">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <input
                                                    placeholder="Goal Title (e.g. Master TypeScript)"
                                                    value={goal.title}
                                                    onChange={e => updateGoal(i, { title: e.target.value })}
                                                    className="w-full bg-transparent border-b border-[var(--color-primary)] text-xl text-white py-2 focus:outline-none placeholder:text-gray-600"
                                                    autoFocus
                                                />
                                                
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-mono text-gray-500 uppercase">Target Time</label>
                                                        <select
                                                            value={goal.target_minutes_per_day}
                                                            onChange={e => updateGoal(i, { target_minutes_per_day: parseInt(e.target.value) })}
                                                            className="w-full bg-[var(--glass-surface)] border border-[var(--glass-border)] text-white p-2 rounded-lg"
                                                        >
                                                            <option value={15}>15 mins / day</option>
                                                            <option value={30}>30 mins / day</option>
                                                            <option value={45}>45 mins / day</option>
                                                            <option value={60}>1 hour / day</option>
                                                            <option value={90}>1.5 hours / day</option>
                                                            <option value={120}>2 hours / day</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-mono text-gray-500 uppercase">Preferred Time</label>
                                                        <select
                                                            value={goal.preferred_time_of_day}
                                                            onChange={e => updateGoal(i, { preferred_time_of_day: e.target.value as any })}
                                                            className="w-full bg-[var(--glass-surface)] border border-[var(--glass-border)] text-white p-2 rounded-lg"
                                                        >
                                                            <option value="morning">Morning 🌅</option>
                                                            <option value="afternoon">Afternoon ☀️</option>
                                                            <option value="evening">Evening 🌆</option>
                                                            <option value="flexible">Flexible ⏰</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <button onClick={() => setEditingGoalIndex(null)} disabled={!goal.title} className="w-full py-3 bg-[var(--color-primary)] text-black font-bold rounded-lg disabled:opacity-50 mt-2">
                                                    Done Editing
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Floating Capacity Bar */}
            <div className="fixed bottom-0 left-0 w-full p-4 pointer-events-none z-50 flex justify-center">
                <div className="bg-[var(--bg-panel)] border border-[var(--glass-border)] shadow-2xl backdrop-blur-xl rounded-2xl p-4 w-full max-w-lg pointer-events-auto">
                    <div className="flex justify-between text-xs font-mono mb-2 uppercase">
                        <span className="text-gray-400">Total Goal Load</span>
                        <span className="text-[var(--color-primary)]">{Math.round(totalGoalMins / 60 * 10) / 10} hrs/day</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--glass-surface)] rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-500 rounded-full ${totalGoalMins > availableMins ? 'bg-red-500' : 'bg-[var(--color-primary)]'}`}
                            style={{ width: `${calcPct}%` }}
                        />
                    </div>
                    {totalGoalMins > availableMins && (
                        <p className="text-[10px] text-red-400 mt-2 text-center uppercase tracking-wider">Warning: Approaching unsustainability.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
