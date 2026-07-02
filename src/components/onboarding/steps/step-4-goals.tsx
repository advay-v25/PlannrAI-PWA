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
            days_per_week: 7,
            energy_demand: 'medium',
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

    const totalGoalMins = goals.reduce((acc, g) => acc + (g.target_minutes_per_day * (g.days_per_week || 7)), 0);
    const availableMins = 7 * 8 * 60; // 8 hours a day, 7 days a week
    const calcPct = Math.min((totalGoalMins / availableMins) * 100, 100);

    return (
        <div className="flex flex-col items-center justify-start space-y-8 w-full max-w-xl mx-auto pb-32">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
                <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
                    Goal <span className="text-[var(--color-primary)]">Discovery</span>
                </h2>
                <p className="text-[var(--text-primary)]/60 tracking-wide text-sm">
                    Set goals across the three pillars of growth.
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-8">
                
                {/* Pillar Nav */}
                <div className="flex gap-3">
                    {PILLARS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => { setActivePillar(p.id as 'mind' | 'body' | 'craft'); setEditingGoalIndex(null); }}
                            className={`flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl transition-all duration-300 border backdrop-blur-md shadow-lg ${
                                activePillar === p.id 
                                    ? `${p.bg} ${p.border} ${p.color} scale-[1.03] shadow-[0_0_20px_rgba(255,255,255,0.05)]` 
                                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] hover:border-[var(--glass-border)] hover:scale-[1.01]'
                            }`}
                        >
                            <p.icon className={`w-6 h-6 ${activePillar === p.id ? 'scale-110' : 'scale-100'} transition-transform duration-300`} />
                            <span className="font-mono text-xs tracking-widest uppercase font-bold">{p.label}</span>
                        </button>
                    ))}
                </div>

                {/* Main Action Area */}
                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-6 rounded-3xl backdrop-blur-xl shadow-2xl space-y-8">
                    {/* Quick Add Area */}
                    <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]/50 uppercase tracking-widest mb-4">
                            Quick Add {activePillar} Goals
                        </p>
                        <div className="flex flex-wrap gap-2.5">
                            {GOAL_TEMPLATES[activePillar].map((t, i) => (
                                <button
                                    key={i}
                                    onClick={() => addDraftGoal(t.title, false, t.minutes)}
                                    className="px-5 py-2.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-active)] hover:bg-white hover:border-white hover:text-black transition-all duration-300 text-sm font-semibold tracking-wide whitespace-nowrap shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                                >
                                    + {t.title}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => addDraftGoal('', true)}
                            className="mt-5 w-full py-4 border border-dashed border-[var(--glass-border)] hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg)] rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] transition-all duration-300 group tracking-wide"
                        >
                            <Plus className="w-5 h-5 group-hover:scale-125 transition-transform duration-300" /> Create Custom Goal
                        </button>
                    </div>

                    {/* Capacity Visualization - Now inside the card flow */}
                    <div className="pt-6 border-t border-[var(--glass-border)]">
                        <div className="flex justify-between text-[10px] font-bold tracking-widest mb-3 uppercase">
                            <span className="text-[var(--text-primary)]/50">Weekly Commitment Load</span>
                            <span className="text-[var(--text-primary)]">{Math.round(totalGoalMins / 60 * 10) / 10} / 56.0 HRS</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--glass-bg)] rounded-full overflow-hidden shadow-inner">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${calcPct}%` }}
                                className={`h-full transition-all duration-700 ease-out rounded-full ${calcPct > 80 ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'bg-[var(--color-primary)] shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.4)]'}`}
                            />
                        </div>
                        <p className="text-[9px] text-[var(--text-primary)]/30 mt-3 text-center uppercase tracking-[0.2em] font-medium italic">Based on an average 8h/day focused deep work capacity.</p>
                    </div>
                </div>

                {/* Selected Goals List */}
                {goals.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]/80 tracking-widest uppercase">Your Selected Path</h3>
                            <span className="bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)]/60 font-bold tracking-widest px-2.5 py-1 rounded-full text-[10px]">{goals.length} ACTIVE</span>
                        </div>
                        
                        <div className="space-y-4">
                            {goals.map((goal, i) => {
                                const pillarData = PILLARS.find(p => p.id === goal.pillar);
                                const isEditing = editingGoalIndex === i;

                                return (
                                    <div key={i} className={`bg-white/[0.03] border backdrop-blur-xl ${isEditing ? 'border-[var(--glass-border)] ring-1 ring-white/20 shadow-2xl' : 'border-[var(--glass-border)] hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg)]'} p-6 rounded-3xl transition-all duration-500 overflow-hidden`}>
                                        
                                        {!isEditing ? (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-5">
                                                    <div className={`p-3.5 rounded-2xl ${pillarData?.bg} ${pillarData?.color} shadow-lg ring-1 ring-white/5`}>
                                                        {pillarData && <pillarData.icon className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-[var(--text-primary)] tracking-tight text-lg">{goal.title || 'Untitled Goal'}</div>
                                                        <div className="text-[11px] text-[var(--text-primary)]/40 flex items-center gap-3 mt-1.5 font-bold uppercase tracking-wider">
                                                            <span className="capitalize">{goal.preferred_time_of_day}</span>
                                                            <span className="w-1 h-1 rounded-full bg-[var(--glass-bg)]" />
                                                            <span>{goal.days_per_week || 7}d/wk</span>
                                                            <span className="w-1 h-1 rounded-full bg-[var(--glass-bg)]" />
                                                            <span>{goal.target_minutes_per_day}m sessions</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingGoalIndex(i)} className="p-3 text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] rounded-2xl transition-all border border-transparent hover:border-[var(--glass-border)]">
                                                        <Settings2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => removeGoal(i)} className="p-3 text-[var(--text-primary)]/30 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all border border-transparent hover:border-red-500/20">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-[10px] font-black tracking-[0.2em] uppercase text-[var(--text-primary)]/40">Calibrating Goal</h4>
                                                    <button onClick={() => setEditingGoalIndex(null)} className="p-1 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors">
                                                        <Trash2 className="w-4 h-4" onClick={(e) => { e.stopPropagation(); removeGoal(i); }} />
                                                    </button>
                                                </div>

                                                <input
                                                    placeholder="Goal Title (e.g. Master TypeScript)"
                                                    value={goal.title}
                                                    onChange={e => updateGoal(i, { title: e.target.value })}
                                                    className="w-full bg-transparent border-b-2 border-[var(--glass-border)] hover:border-[var(--glass-border)] focus:border-[var(--color-primary)] text-2xl text-[var(--text-primary)] py-3 focus:outline-none placeholder:text-[var(--text-primary)]/20 transition-all font-black tracking-tight"
                                                    autoFocus
                                                />
                                                
                                                <div className="grid grid-cols-2 gap-8">
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-center px-1">
                                                            <label className="text-[10px] font-black tracking-widest text-[var(--text-primary)]/40 uppercase">Days / Week</label>
                                                            <span className="text-xs font-mono font-black text-[var(--color-primary)]">{goal.days_per_week || 7}D</span>
                                                        </div>
                                                        <input
                                                            type="range" min={1} max={7} step={1}
                                                            value={goal.days_per_week || 7}
                                                            onChange={e => updateGoal(i, { days_per_week: parseInt(e.target.value) })}
                                                            className="w-full accent-[var(--color-primary)] h-1.5 bg-[var(--glass-bg)] rounded-full appearance-none cursor-pointer"
                                                        />
                                                    </div>
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-center px-1">
                                                            <label className="text-[10px] font-black tracking-widest text-[var(--text-primary)]/40 uppercase">Mins / Session</label>
                                                            <span className="text-xs font-mono font-black text-[var(--color-primary)]">{goal.target_minutes_per_day}M</span>
                                                        </div>
                                                        <input
                                                            type="range" min={15} max={180} step={15}
                                                            value={goal.target_minutes_per_day}
                                                            onChange={e => updateGoal(i, { target_minutes_per_day: parseInt(e.target.value) })}
                                                            className="w-full accent-[var(--color-primary)] h-1.5 bg-[var(--glass-bg)] rounded-full appearance-none cursor-pointer"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black tracking-widest text-[var(--text-primary)]/40 uppercase ml-1">Energy Demand</label>
                                                        <div className="flex bg-[var(--glass-bg-active)] p-1.5 rounded-2xl border border-[var(--glass-border)]">
                                                            {(['light', 'medium', 'heavy'] as const).map(e => (
                                                                <button
                                                                    key={e}
                                                                    onClick={() => updateGoal(i, { energy_demand: e })}
                                                                    className={`flex-1 text-[9px] font-black py-2 rounded-xl transition-all uppercase tracking-tighter ${goal.energy_demand === e
                                                                        ? 'bg-white text-black shadow-lg'
                                                                        : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]'
                                                                    }`}
                                                                >
                                                                    {e}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black tracking-widest text-[var(--text-primary)]/40 uppercase ml-1">Priority</label>
                                                        <div className="flex bg-[var(--glass-bg-active)] p-1.5 rounded-2xl border border-[var(--glass-border)]">
                                                            {(['low', 'medium', 'high'] as const).map(p => (
                                                                <button
                                                                    key={p}
                                                                    onClick={() => updateGoal(i, { importance: p })}
                                                                    className={`flex-1 text-[9px] font-black py-2 rounded-xl transition-all uppercase tracking-tighter ${goal.importance === p
                                                                        ? 'bg-white text-black shadow-lg'
                                                                        : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]'
                                                                    }`}
                                                                >
                                                                    {p}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black tracking-widest text-[var(--text-primary)]/40 uppercase ml-1">Pillar</label>
                                                        <select
                                                            value={goal.pillar}
                                                            onChange={e => updateGoal(i, { pillar: e.target.value as 'mind' | 'body' | 'craft' })}
                                                            className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] focus:border-[var(--glass-border)] text-[var(--text-primary)] px-4 py-2.5 rounded-2xl transition-colors text-xs font-bold appearance-none outline-none"
                                                        >
                                                            <option value="mind">Mind 🧠</option>
                                                            <option value="body">Body 💪</option>
                                                            <option value="craft">Craft 💼</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black tracking-widest text-[var(--text-primary)]/40 uppercase ml-1">Preferred Time</label>
                                                        <select
                                                            value={goal.preferred_time_of_day}
                                                            onChange={e => updateGoal(i, { preferred_time_of_day: e.target.value as 'morning' | 'afternoon' | 'evening' | 'flexible' })}
                                                            className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] focus:border-[var(--glass-border)] text-[var(--text-primary)] px-4 py-2.5 rounded-2xl transition-colors text-xs font-bold appearance-none outline-none"
                                                        >
                                                            <option value="morning">Morning 🌅</option>
                                                            <option value="afternoon">Afternoon ☀️</option>
                                                            <option value="evening">Evening 🌆</option>
                                                            <option value="flexible">Flexible ⏰</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => setEditingGoalIndex(null)} 
                                                    disabled={!goal.title} 
                                                    className="w-full py-5 bg-white text-black font-black text-xs tracking-[0.3em] uppercase rounded-2xl disabled:opacity-50 mt-4 hover:scale-[1.01] active:scale-95 transition-all shadow-xl hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                                                >
                                                    SAVE CALIBRATION
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
        </div>
    );
}
