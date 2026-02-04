'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { X, Sparkles, Check, ArrowRight, Brain, Calendar, List } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function GoalStrategyModal({
    goal,
    isOpen,
    onClose
}: {
    goal: any;
    isOpen: boolean;
    onClose: () => void
}) {
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(false);
    const [strategy, setStrategy] = useState<any>(goal.ai_strategy || null);

    const handleDecompose = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/ai/decompose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal_id: goal.id, constraint_level: 'Beginner' })
            });
            const data = await res.json();
            if (data.plan) setStrategy(data.plan);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };
    const handleSchedule = async () => {
        // Simple MVP: Schedule for today at next hour
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        const startTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const today = now.toISOString().split('T')[0];

        try {
            const res = await fetch('/api/goals/schedule-strategy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal_id: goal.id, start_time: startTime, date: today })
            });
            if (res.ok) {
                alert('Scheduled for ' + startTime);
                onClose();
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <GlassCard className="w-full max-w-2xl max-h-[85vh] overflow-y-auto" padding="lg">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Expert Strategy</h2>
                            <p className="text-sm text-[var(--color-text-muted)]">AI Deconstruction for "{goal.title}"</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {!strategy ? (
                    <div className="text-center py-12 space-y-4">
                        <Sparkles className="w-12 h-12 text-indigo-400 mx-auto animate-pulse" />
                        <h3 className="text-lg font-medium">Ready to consult the Expert?</h3>
                        <p className="text-[var(--color-text-tertiary)] max-w-sm mx-auto">
                            I will break this goal down into a daily protocol, milestone roadmap, and pre-flight checklists.
                        </p>
                        <GlassButton
                            variant="primary"
                            onClick={handleDecompose}
                            loading={isLoading}
                            className="w-full max-w-xs mx-auto"
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Strategy
                        </GlassButton>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Strategy One-Liner */}
                        <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                            <p className="text-indigo-300 font-medium text-center">"{strategy.strategy_one_liner}"</p>
                        </div>

                        {/* Routine Protocol */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> Daily Protocol
                            </h3>
                            <GlassCard padding="sm" className="bg-white/5">
                                <div className="space-y-2">
                                    {strategy.routine?.steps?.map((step: string, i: number) => (
                                        <div key={i} className="flex items-start gap-3 text-sm">
                                            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-xs mt-0.5">
                                                {i + 1}
                                            </div>
                                            <p>{step}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
                                    <GlassButton size="sm" variant="ghost" className="w-full" onClick={handleSchedule}>
                                        <Check className="w-3 h-3 mr-2" /> Apply to Calendar (Today)
                                    </GlassButton>
                                </div>
                            </GlassCard>
                        </div>

                        {/* Checklists */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-2">
                                <List className="w-4 h-4" /> Pre-Flight Checklist
                            </h3>
                            <div className="grid grid-cols-1 gap-2">
                                {strategy.checklist?.map((item: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                                        <div className="w-4 h-4 rounded border border-white/20" />
                                        <span className="text-sm">{item.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <GlassButton variant="primary" className="flex-1" onClick={onClose}>
                                Save Strategy
                            </GlassButton>
                            <GlassButton variant="ghost" onClick={() => setStrategy(null)}>
                                Regenerate
                            </GlassButton>
                        </div>
                    </div>
                )}
            </GlassCard>
        </div>
    );

}


