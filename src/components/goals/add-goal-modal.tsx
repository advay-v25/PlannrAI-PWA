'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useGoalsStore } from '@/stores';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input'; // Ensure this exists or use html input
import {
    Brain, Dumbbell, Briefcase, // Pillars
    Clock, Zap, Sparkles, X, Plus
} from 'lucide-react';
import type { GoalCategory, GoalImportance, EnergyDemand } from '@/types/database';

// Helper for icons
const PILLARS = [
    { id: 'mind', label: 'Mind', icon: Brain, color: 'var(--color-mind)' },
    { id: 'body', label: 'Body', icon: Dumbbell, color: 'var(--color-body)' },
    { id: 'craft', label: 'Craft', icon: Briefcase, color: 'var(--color-craft)' },
];

export function AddGoalModal({ onClose, onSuccess, onSave, initialValues }: {
    onClose: () => void,
    onSuccess?: () => void,
    onSave?: (goal: Partial<any>) => void,
    initialValues?: { title?: string, category?: GoalCategory }
}) {
    const supabase = createClient();
    const { addGoal } = useGoalsStore();

    // Form State
    const [title, setTitle] = useState(initialValues?.title || '');
    const [category, setCategory] = useState<GoalCategory>(initialValues?.category || 'mind');
    const [minutes, setMinutes] = useState(30);
    const [importance, setImportance] = useState<GoalImportance>('medium');
    const [energy, setEnergy] = useState<EnergyDemand>('medium');

    // AI Suggestions
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    // Debounce for AI suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (title.length < 5) return;
            setLoadingSuggestions(true);
            try {
                // Call generic AI suggestion or categorize API
                // For now, simulate simple categorization or basic suggestions
                // Ideally this would hit an API that returns { category, minutes, energy } based on title
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingSuggestions(false);
            }
        };

        const timer = setTimeout(fetchSuggestions, 1000);
        return () => clearTimeout(timer);
    }, [title]);

    const handleSubmit = async () => {
        if (!title.trim()) return;

        const goalData = {
            title,
            category,
            minutes_per_day: minutes,
            importance,
            energy_demand: energy,
            status: 'active'
        };

        if (onSave) {
            onSave(goalData);
            onClose();
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newGoal = {
            ...goalData,
            user_id: user.id,
        };

        // Optimistic update locally? Or wait for DB?
        // Let's insert to DB then add to store
        // @ts-ignore - Supabase types might be slightly off
        const { data, error } = await supabase.from('goals').insert(newGoal).select().single();

        if (data && !error) {
            addGoal(data);
            if (onSuccess) onSuccess();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg glass-card p-6 m-4"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Invest Your Time</h2>
                    <button onClick={onClose}><X className="w-5 h-5 opacity-50 hover:opacity-100" /></button>
                </div>

                <div className="space-y-6">
                    {/* 1. Title Input */}
                    <div className="space-y-2">
                        <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">What do you want to do?</label>
                        <GlassInput
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Learn Python, Morning Run, Write Book..."
                            className="text-lg font-medium"
                            autoFocus
                        />
                        {loadingSuggestions && <p className="text-xs text-[var(--color-primary)] flex items-center gap-1"><Sparkles className="w-3 h-3 animate-pulse" /> AI analyzing...</p>}
                    </div>

                    {/* 2. Pillar & Priority */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">Pillar</label>
                            <div className="flex gap-1">
                                {PILLARS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setCategory(p.id as GoalCategory)}
                                        className={`flex-1 p-2 rounded-lg flex flex-col items-center gap-1 transition-all ${category === p.id ? 'bg-[var(--glass-border)] ring-1 ring-[var(--color-primary)]' : 'opacity-60 hover:opacity-100'}`}
                                    >
                                        <p.icon className="w-4 h-4" style={{ color: p.color }} />
                                        <span className="text-[10px]">{p.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">Priority</label>
                            <div className="flex gap-1 h-full">
                                {(['low', 'medium', 'high'] as GoalImportance[]).map(imp => (
                                    <button
                                        key={imp}
                                        onClick={() => setImportance(imp)}
                                        className={`flex-1 rounded-lg text-xs capitalize ${importance === imp ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'}`}
                                    >
                                        {imp}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 3. Time & Energy */}
                    <div className="space-y-4 p-4 bg-[var(--glass-bg)] rounded-xl border border-[var(--glass-border)]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                                <span className="text-sm font-medium">Daily Investment</span>
                            </div>
                            <span className="font-mono text-lg font-bold">{minutes}m</span>
                        </div>
                        <input
                            type="range" min={5} max={180} step={5}
                            value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value))}
                            className="w-full accent-[var(--color-primary)]"
                        />

                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-[var(--color-warning)]" />
                                <span className="text-sm font-medium">Energy Demand</span>
                            </div>
                            <div className="flex gap-1 bg-[var(--glass-bg-subtle)] p-1 rounded-lg">
                                {(['light', 'medium', 'heavy'] as EnergyDemand[]).map(e => (
                                    <button
                                        key={e}
                                        onClick={() => setEnergy(e)}
                                        className={`px-3 py-1 rounded text-xs capitalize ${energy === e ? 'bg-[var(--glass-border)] shadow-sm' : 'opacity-60'}`}
                                    >
                                        {e}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <GlassButton
                        variant="primary"
                        className="w-full py-4 text-base"
                        onClick={handleSubmit}
                        disabled={!title}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Goal
                    </GlassButton>
                </div>
            </motion.div>
        </div>
    );
}
