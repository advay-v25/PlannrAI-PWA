import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Plus, CheckCircle2, Flame, Loader2, Save, Edit2, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';

interface HabitStackModalProps {
    isOpen: boolean;
    onClose: () => void;
    stacks: any[];
    onUpdated: () => void;
}

export function HabitStackModal({ isOpen, onClose, stacks, onUpdated }: HabitStackModalProps) {
    const supabase = createClient();
    const { showToast } = useToast();
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [draftStack, setDraftStack] = useState<any | null>(null);
    const [draftMode, setDraftMode] = useState<'morning' | 'evening' | 'custom'>('morning');
    const [completingId, setCompletingId] = useState<string | null>(null);

    const handleGenerate = async (mode: 'morning' | 'evening' | 'custom') => {
        setIsGenerating(true);
        setDraftMode(mode);
        try {
            const res = await fetch('/api/habit-stacks/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            const data = await res.json();
            if (data.success && data.data?.stacks?.length > 0) {
                const stack = data.data.stacks[0];
                setDraftStack({
                    name: stack.name || `${mode.charAt(0).toUpperCase() + mode.slice(1)} Routine`,
                    steps: stack.steps || [],
                    preferred_window: stack.schedule_hint?.time_of_day || mode
                });
                if (data.data.donna_note) {
                    showToast(data.data.donna_note, 'info');
                }
            } else {
                throw new Error(data.error || 'Failed to generate');
            }
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveDraft = async () => {
        if (!draftStack) return;
        try {
            const res = await fetch('/api/habit-stacks/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draftStack)
            });
            const data = await res.json();
            if (data.success) {
                showToast('Routine saved successfully', 'success');
                setDraftStack(null);
                onUpdated();
            } else {
                throw new Error(data.error);
            }
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleComplete = async (id: string) => {
        setCompletingId(id);
        try {
            const res = await fetch(`/api/habit-stacks/${id}/complete`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Routine completed! Streak: ${data.data.newStreak} 🔥`, 'success');
                onUpdated();
            } else {
                throw new Error(data.error);
            }
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setCompletingId(null);
        }
    };

    const updateDraftStep = (index: number, field: string, value: any) => {
        const newSteps = [...draftStack.steps];
        newSteps[index] = { ...newSteps[index], [field]: value };
        setDraftStack({ ...draftStack, steps: newSteps });
    };

    const addDraftStep = () => {
        setDraftStack({ ...draftStack, steps: [...draftStack.steps, { title: 'New Step', minutes: 5 }] });
    };

    const removeDraftStep = (index: number) => {
        const newSteps = draftStack.steps.filter((_: any, i: number) => i !== index);
        setDraftStack({ ...draftStack, steps: newSteps });
    };

    if (!isOpen) return null;

    const todayStr = new Date().toISOString().split('T')[0];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                <div className="flex items-center justify-between p-6 border-b border-[var(--glass-border)]">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Layers className="w-5 h-5 text-[var(--color-primary)]" />
                            Your Routines
                        </h2>
                        <p className="text-sm text-[var(--text-secondary)]">Manage your daily habit stacks</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--glass-bg)] rounded-full transition-colors text-[var(--text-secondary)]">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    
                    {/* Draft Mode */}
                    {draftStack && (
                        <div className="bg-[var(--glass-bg)] border border-[var(--color-primary)]/50 rounded-xl p-6 shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.1)]">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <Edit2 className="w-4 h-4 text-[var(--color-primary)]" />
                                    Review AI Draft
                                </h3>
                                <button onClick={() => setDraftStack(null)} className="text-sm text-[var(--text-secondary)] hover:text-white">
                                    Cancel
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-semibold mb-1 block">Routine Name</label>
                                    <input 
                                        type="text" 
                                        value={draftStack.name}
                                        onChange={(e) => setDraftStack({ ...draftStack, name: e.target.value })}
                                        className="w-full bg-black/20 border border-[var(--glass-border)] rounded-lg p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-semibold mb-2 block flex justify-between items-center">
                                        Steps
                                        <button onClick={addDraftStep} className="text-[var(--color-primary)] hover:text-[var(--color-primary-light)] flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> Add
                                        </button>
                                    </label>
                                    <div className="space-y-2">
                                        {draftStack.steps.map((step: any, idx: number) => (
                                            <div key={idx} className="flex gap-2">
                                                <input 
                                                    type="text"
                                                    value={step.title}
                                                    onChange={(e) => updateDraftStep(idx, 'title', e.target.value)}
                                                    className="flex-1 bg-black/20 border border-[var(--glass-border)] rounded-lg p-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                                                    placeholder="E.g. Drink water"
                                                />
                                                <div className="relative w-24">
                                                    <input 
                                                        type="number"
                                                        value={step.minutes}
                                                        onChange={(e) => updateDraftStep(idx, 'minutes', parseInt(e.target.value) || 0)}
                                                        className="w-full bg-black/20 border border-[var(--glass-border)] rounded-lg p-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] pr-8"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">m</span>
                                                </div>
                                                <button onClick={() => removeDraftStep(idx)} className="p-2 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={handleSaveDraft}
                                    className="w-full mt-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_15px_var(--color-primary-glow)] flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Save Routine
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Active Stacks List */}
                    {!draftStack && (
                        <div className="space-y-6">
                            {['morning', 'evening', 'custom'].map(time => {
                                const matchedStacks = stacks.filter(s => s.preferred_window === time || (!s.preferred_window && time === 'custom'));
                                
                                return (
                                    <div key={time} className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                                                {time} Routines
                                            </h3>
                                            {matchedStacks.length === 0 && (
                                                <button 
                                                    onClick={() => handleGenerate(time as any)}
                                                    disabled={isGenerating}
                                                    className="text-xs text-[var(--color-primary)] hover:text-white flex items-center gap-1 transition-colors px-2 py-1 bg-[var(--color-primary)]/10 rounded-lg"
                                                >
                                                    {isGenerating && draftMode === time ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="w-3 h-3" />
                                                    )}
                                                    Generate AI Routine
                                                </button>
                                            )}
                                        </div>
                                        
                                        {matchedStacks.length === 0 ? (
                                            <div className="border border-dashed border-[var(--glass-border)] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                                                <p className="text-sm text-[var(--text-secondary)] mb-2">No {time} routine set up yet.</p>
                                            </div>
                                        ) : (
                                            matchedStacks.map(stack => {
                                                const isCompletedToday = stack.last_completed?.startsWith(todayStr);
                                                const stepsArray = Array.isArray(stack.steps) ? stack.steps : [];
                                                
                                                return (
                                                    <div key={stack.id} className={`p-4 rounded-xl border transition-all ${isCompletedToday ? 'border-green-500/30 bg-green-500/5' : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'}`}>
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div>
                                                                <h4 className="font-bold text-[var(--text-primary)]">{stack.name || 'Routine'}</h4>
                                                                <div className="flex items-center gap-3 mt-1">
                                                                    <div className="flex items-center gap-1 text-orange-500 text-xs font-semibold">
                                                                        <Flame className="w-3.5 h-3.5" />
                                                                        {stack.current_streak || 0} Day Streak
                                                                    </div>
                                                                    <div className="text-xs text-[var(--text-secondary)]">
                                                                        {stack.action_duration_mins || 0} mins
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            
                                                            <button 
                                                                onClick={() => handleComplete(stack.id)}
                                                                disabled={isCompletedToday || completingId === stack.id}
                                                                className={`p-2 rounded-full transition-colors flex items-center justify-center ${isCompletedToday ? 'bg-green-500 text-white' : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--color-primary)]'}`}
                                                            >
                                                                {completingId === stack.id ? (
                                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                                ) : (
                                                                    <CheckCircle2 className="w-5 h-5" />
                                                                )}
                                                            </button>
                                                        </div>
                                                        
                                                        {stepsArray.length > 0 && (
                                                            <ul className="space-y-2 mt-4 border-t border-[var(--glass-border)] pt-4">
                                                                {stepsArray.map((step: any, i: number) => (
                                                                    <li key={i} className="flex items-start gap-3 text-sm">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] mt-1.5 opacity-50" />
                                                                        <span className="flex-1 text-[var(--text-primary)] opacity-90">{step.title || step}</span>
                                                                        {step.minutes && <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">{step.minutes}m</span>}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    
                </div>
            </motion.div>
        </div>
    );
}
