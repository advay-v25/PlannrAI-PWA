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
    { id: 'mind', label: 'Mind', icon: Brain, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' },
    { id: 'body', label: 'Body', icon: Dumbbell, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30' },
    { id: 'craft', label: 'Craft', icon: Paintbrush, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30' },
];

export function Step4Goals() {
    const { data, updateData } = useOnboardingStore();
    const [activePillar, setActivePillar] = useState<'mind' | 'body' | 'craft'>('mind');
    const [editingGoalIndex, setEditingGoalIndex] = useState<number | null>(null);

    const goals = data.goals || [];

    const addDraftGoal = (title: string, customTitle: boolean = false, target_mins: number = 30) => {
        const newGoal: OnboardingGoal = {
            title,
            pillar: activePillar,
            current_minutes_per_day: 0,
            target_minutes_per_day: target_mins,
            preferred_time_of_day: 'flexible',
            importance: 'high'
        };
        const newIndex = goals.length;
        updateData({ goals: [...goals, newGoal] });
        if (customTitle) {
            setEditingGoalIndex(newIndex);
        }
    };

    const removeGoal = (index: number) => {
        const next = [...goals];
        next.splice(index, 1);
        updateData({ goals: next });
        if (editingGoalIndex === index) setEditingGoalIndex(null);
    };

    const updateGoal = (index: number, updates: Partial<OnboardingGoal>) => {
        const next = [...goals];
        next[index] = { ...next[index], ...updates };
        updateData({ goals: next });
    };

    const totalGoalMins = goals.reduce((acc, g) => acc + g.target_minutes_per_day, 0);
    const availableMins = 8 * 60;
    const calcPct = Math.min((totalGoalMins / availableMins) * 100, 100);

    return (
        <div className="flex flex-col items-center justify-start space-y-8 w-full max-w-xl mx-auto pb-24">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-white font-mono uppercase">
                    Goal <span className="text-[var(--color-primary)]">Discovery</span>
                </h2>
                <p className="text-white/60 tracking-wide text-sm">
                    Set goals across the three pillars of growth.
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-8">
                
                {/* Pillar Nav */}
                <div className="flex gap-3">
                    {PILLARS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => { setActivePillar(p.id as any); setEditingGoalIndex(null); }}
                            className={`flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl transition-all duration-300 border backdrop-blur-md shadow-lg ${
                                activePillar === p.id 
                                    ? `${p.bg} ${p.border} ${p.color} scale-[1.03] shadow-[0_0_20px_rgba(255,255,255,0.05)]` 
                                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20 hover:scale-[1.01]'
                            }`}
                        >
                            <p.icon className={`w-6 h-6 ${activePillar === p.id ? 'scale-110' : 'scale-100'} transition-transform duration-300`} />
                            <span className="font-mono text-xs tracking-widest uppercase font-bold">{p.label}</span>
                        </button>
                    ))}
                </div>

                {/* Quick Add Area */}
                <div className="bg-white/5 border border-white/10 p-6 rounded-3xl backdrop-blur-md shadow-lg">
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">
                        Quick Add {activePillar} Goals
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                        {GOAL_TEMPLATES[activePillar].map((t, i) => (
                            <button
                                key={i}
                                onClick={() => addDraftGoal(t.title, false, t.minutes)}
                                className="px-5 py-2.5 rounded-full border border-white/20 bg-black/20 hover:bg-white hover:border-white hover:text-black transition-all duration-300 text-sm font-semibold tracking-wide whitespace-nowrap shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                            >
                                + {t.title}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => addDraftGoal('', true)}
                        className="mt-5 w-full py-4 border border-dashed border-white/20 hover:border-white/60 hover:bg-white/5 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold text-white/50 hover:text-white transition-all duration-300 group tracking-wide"
                    >
                        <Plus className="w-5 h-5 group-hover:scale-125 transition-transform duration-300" /> Create Custom Goal
                    </button>
                </div>

                {/* Selected Goals List */}
                {goals.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-sm font-semibold text-white/80 tracking-widest uppercase">Your Goals</h3>
                            <span className="bg-white/10 border border-white/10 text-white/60 font-bold tracking-widest px-2.5 py-1 rounded-full text-[10px]">{goals.length} ACTIVE</span>
                        </div>
                        
                        <div className="space-y-3">
                            {goals.map((goal, i) => {
                                const pillarData = PILLARS.find(p => p.id === goal.pillar);
                                const isEditing = editingGoalIndex === i;

                                return (
                                    <div key={i} className={`bg-black/40 border backdrop-blur-md ${isEditing ? 'border-white/50 shadow-xl' : 'border-white/10 hover:border-white/30 hover:bg-white/5'} p-5 rounded-2xl transition-all duration-300`}>
                                        
                                        {!isEditing ? (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2.5 rounded-xl ${pillarData?.bg} ${pillarData?.color} shadow-inner bg-opacity-20`}>
                                                        {pillarData && <pillarData.icon className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-white tracking-wide text-lg">{goal.title || 'Untitled Goal'}</div>
                                                        <div className="text-xs text-white/50 flex items-center gap-2 mt-1 font-medium">
                                                            <span className="capitalize">{goal.preferred_time_of_day}</span> • 
                                                            <span>Target: {goal.target_minutes_per_day}m/day</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingGoalIndex(i)} className="p-2.5 text-white/30 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                                                        <Settings2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => removeGoal(i)} className="p-2.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-5">
                                                <input
                                                    placeholder="Goal Title (e.g. Master TypeScript)"
                                                    value={goal.title}
                                                    onChange={e => updateGoal(i, { title: e.target.value })}
                                                    className="w-full bg-transparent border-b-2 border-white/20 hover:border-white/50 focus:border-white text-xl text-white py-2 focus:outline-none placeholder:text-white/30 transition-colors font-bold tracking-wide"
                                                    autoFocus
                                                />
                                                
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold tracking-widest text-white/50 uppercase ml-1">Target Time</label>
                                                        <select
                                                            value={goal.target_minutes_per_day}
                                                            onChange={e => updateGoal(i, { target_minutes_per_day: parseInt(e.target.value) })}
                                                            className="w-full bg-white/5 border border-white/10 focus:border-white/30 text-white p-3 rounded-xl transition-colors font-medium appearance-none"
                                                        >
                                                            <option value={15} className="bg-black text-white">15 mins / day</option>
                                                            <option value={30} className="bg-black text-white">30 mins / day</option>
                                                            <option value={45} className="bg-black text-white">45 mins / day</option>
                                                            <option value={60} className="bg-black text-white">1 hour / day</option>
                                                            <option value={90} className="bg-black text-white">1.5 hours / day</option>
                                                            <option value={120} className="bg-black text-white">2 hours / day</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold tracking-widest text-white/50 uppercase ml-1">Preferred Time</label>
                                                        <select
                                                            value={goal.preferred_time_of_day}
                                                            onChange={e => updateGoal(i, { preferred_time_of_day: e.target.value as any })}
                                                            className="w-full bg-white/5 border border-white/10 focus:border-white/30 text-white p-3 rounded-xl transition-colors font-medium appearance-none"
                                                        >
                                                            <option value="morning" className="bg-black text-white">Morning 🌅</option>
                                                            <option value="afternoon" className="bg-black text-white">Afternoon ☀️</option>
                                                            <option value="evening" className="bg-black text-white">Evening 🌆</option>
                                                            <option value="flexible" className="bg-black text-white">Flexible ⏰</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <button onClick={() => setEditingGoalIndex(null)} disabled={!goal.title} className="w-full py-4 bg-white text-black font-bold tracking-wide rounded-xl disabled:opacity-50 mt-2 hover:scale-[1.02] active:scale-95 transition-all shadow-lg hover:shadow-xl">
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
            <div className="fixed bottom-24 left-0 w-full p-4 pointer-events-none z-40 flex justify-center">
                <div className="bg-black/60 border border-white/10 shadow-2xl backdrop-blur-xl rounded-2xl p-5 w-full max-w-lg pointer-events-auto">
                    <div className="flex justify-between text-[10px] font-bold tracking-widest mb-2 uppercase">
                        <span className="text-white/50">Daily Goal Load</span>
                        <span className="text-white">{Math.round(totalGoalMins / 60 * 10) / 10} / 8.0 HRS</span>
                    </div>
                    <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden shadow-inner">
                        <div 
                            className={`h-full transition-all duration-700 ease-out rounded-full ${totalGoalMins > availableMins ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]'}`}
                            style={{ width: `${calcPct}%` }}
                        />
                    </div>
                    {totalGoalMins > availableMins && (
                        <p className="text-[10px] text-red-400 mt-3 text-center uppercase tracking-widest font-bold">⚠️ Warning: Load may be unsustainable.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
