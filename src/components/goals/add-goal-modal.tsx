'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useGoalsStore } from '@/stores';
import { GlassButton } from '@/components/ui/glass-button';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';
import { GlassInput } from '@/components/ui/glass-input'; // Ensure this exists or use html input
import {
    Brain, Dumbbell, Briefcase, // Pillars
    Clock, Zap, Sparkles, X, Plus, CalendarDays
} from 'lucide-react';
import type { GoalCategory, GoalImportance, EnergyDemand } from '@/types/goals';

// Helper for icons
const PILLARS = [
    { id: 'mind', label: 'Mind', icon: Brain, color: 'var(--color-mind)' },
    { id: 'body', label: 'Body', icon: Dumbbell, color: 'var(--color-body)' },
    { id: 'craft', label: 'Craft', icon: Briefcase, color: 'var(--color-craft)' },
];

export function AddGoalModal({ onClose, onSuccess, onSave, initialValues }: {
    onClose: () => void,
    onSuccess?: () => void,
    onSave?: (goal: Record<string, unknown>) => void,
    initialValues?: Partial<any>
}) {
    const supabase = createClient();
    const { addGoal } = useGoalsStore();

    // Form State
    const [title, setTitle] = useState(initialValues?.title || '');
    const [category, setCategory] = useState<GoalCategory>(initialValues?.category || 'mind');
    const [minutes, setMinutes] = useState(initialValues?.minutes_per_day || 30);
    const [daysPerWeek, setDaysPerWeek] = useState(initialValues?.days_per_week || 7);
    const [importance, setImportance] = useState<GoalImportance>(initialValues?.importance || 'medium');
    const [energy, setEnergy] = useState<EnergyDemand>(initialValues?.energy_demand || 'medium');
    const [preferredTime, setPreferredTime] = useState<'morning' | 'afternoon' | 'evening' | 'any'>(initialValues?.constraints?.preferred_time || 'any');

    // AI Suggestions & Loading State
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Debounce for AI suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (title.length < 3) return;
            setLoadingSuggestions(true);
            try {
                const lowerTitle = title.toLowerCase();
                
                // Body Keywords
                if (lowerTitle.match(/gym|run|workout|exercise|lift|swim|yoga|fitness|sport/)) {
                    setCategory('body');
                    setEnergy('heavy');
                }
                // Mind Keywords
                else if (lowerTitle.match(/read|study|learn|code|book|course|math|science/)) {
                    setCategory('mind');
                    if (energy === 'heavy') setEnergy('medium'); // Optional adjustment
                }
                // Craft / Life Admin Keywords
                else if (lowerTitle.match(/finance|budget|plan|invest|tax|work|project|business|build|create|write|app/)) {
                    setCategory('craft');
                }
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
        if (!title.trim() || isSubmitting) return;
        setIsSubmitting(true);

        const goalData = {
            title,
            category,
            days_per_week: daysPerWeek,
            minutes_per_day: minutes,
            weekly_target_minutes: minutes * daysPerWeek,
            importance,
            energy_demand: energy,
            status: 'active',
            constraints: { preferred_time: preferredTime } // Store preference
        };

        if (onSave) {
            onSave(goalData);
            onClose();
            return;
        }

        try {
            // Use API Client to ensure backend hooks (Context triggers) run
            // This will trigger ReactiveGoalService -> Coach Proposal
            const { apiClient } = await import('@/lib/api-client');
            const response = await apiClient.post<{ goal: any }>('/api/goals', goalData);

            if (response?.goal) {
                addGoal(response.goal);

                // Notify user via Toast that Coach is thinking
                const { useToast } = await import('@/components/ui/toast');
                // Note: We can't easily access hook here if not imported at top level, 
                // but we can assume success if no error.
                // The parent component might handle toast, or we rely on 'addGoal' updating UI.
            }

            if (onSuccess) onSuccess();
            onClose();

        } catch (error) {
            console.error('Failed to create goal:', error);
            // Ideally show error toast here
        } finally {
            setIsSubmitting(false);
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
                                        className={`flex-1 p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${category === p.id ? 'bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/20 shadow-md text-[var(--color-primary)] dark:bg-white/10 dark:ring-white/20 dark:text-white' : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                                    >
                                        <p.icon className="w-5 h-5" style={category === p.id ? { color: p.color } : undefined} />
                                        <span className="text-[10px] font-semibold tracking-wide uppercase">{p.label}</span>
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
                                        className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-all ${importance === imp ? 'bg-[var(--color-primary)] text-white dark:bg-white dark:text-black shadow-md' : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
                                    >
                                        {imp}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 3. Time, Frequency & Energy */}
                    <div className="space-y-4 p-4 bg-[var(--glass-bg)] rounded-xl border border-[var(--glass-border)]">
                        {/* Time Preference Selector */}
                        <div className="space-y-2 mb-4 pb-4 border-b border-[var(--glass-border)]">
                            <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">When do you do this best?</label>
                            <div className="flex gap-1">
                                {(['morning', 'afternoon', 'evening', 'any'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setPreferredTime(t)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${preferredTime === t
                                            ? 'bg-[var(--color-primary)] text-white dark:bg-white dark:text-black shadow-md'
                                            : 'bg-[var(--glass-bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-[var(--text-primary)]" />
                                        <span className="text-sm font-medium">Daily Mins</span>
                                    </div>
                                    <span className="font-mono text-sm font-bold">{minutes}m</span>
                                </div>
                                <input
                                    type="range" min={5} max={180} step={5}
                                    value={minutes}
                                    onChange={(e) => setMinutes(Number(e.target.value))}
                                    className="w-full accent-[var(--color-primary)] dark:accent-white"
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4 text-[var(--text-primary)]" />
                                        <span className="text-sm font-medium">Days / Week</span>
                                    </div>
                                    <span className="font-mono text-sm font-bold">{daysPerWeek}d</span>
                                </div>
                                <input
                                    type="range" min={1} max={7} step={1}
                                    value={daysPerWeek}
                                    onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                                    className="w-full accent-[var(--color-primary)] dark:accent-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[var(--glass-border)]">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-[var(--color-warning)]" />
                                <span className="text-sm font-medium">Energy</span>
                            </div>
                            <div className="flex gap-1 bg-[var(--glass-bg-subtle)] p-1 rounded-lg">
                                {(['light', 'medium', 'heavy'] as EnergyDemand[]).map(e => (
                                    <button
                                        key={e}
                                        onClick={() => setEnergy(e)}
                                        className={`px-4 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${energy === e ? 'bg-[var(--color-primary)] text-white dark:bg-white dark:text-black shadow-md' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                                    >
                                        {e}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        className="w-full py-4 text-base font-bold rounded-xl bg-[var(--color-primary)] text-white dark:bg-white dark:text-black hover:bg-[var(--color-primary-hover)] dark:hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg flex items-center justify-center gap-2"
                        onClick={handleSubmit}
                        disabled={!title || isSubmitting}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2 text-[var(--text-primary)]/70 dark:text-black/70">
                                <Sparkles className="w-4 h-4 animate-spin" /> Creating...
                            </span>
                        ) : (
                            <>
                                <Plus className="w-5 h-5" /> Add Goal
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
