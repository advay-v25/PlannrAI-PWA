'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, ArrowLeft, MoreVertical, CheckCircle2, Circle } from 'lucide-react';
import { isPreviewEnabled } from '@/lib/featureFlags';
import { ComingSoon } from '@/components/ui/ComingSoon';
import { useHabitStacksStore } from '@/stores';
import { toast } from 'sonner';

export default function HabitsPage() {
    const { stacks, isLoading, completeStack, addStack, updateStack, removeStack, setLoading } = useHabitStacksStore();

    if (!isPreviewEnabled()) {
        return (
            <div className="w-full h-full p-4 overflow-y-auto">
                <ComingSoon title="Habit Stacks" subtitle="Coming soon in a future update." />
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Habit Stacks</h1>
                    <p className="text-white/60">Stack new habits onto existing ones to build strong routines.</p>
                </div>
                <button 
                    onClick={() => {
                        toast.success("Feature flag enabled! API integration coming soon.");
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white font-medium rounded-xl hover:bg-orange-600 transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    <span>New Stack</span>
                </button>
            </header>

            {isLoading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
                </div>
            ) : stacks.length === 0 ? (
                <div className="text-center py-24 border border-white/5 rounded-3xl bg-white/5 backdrop-blur-sm">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Plus className="w-8 h-8 text-white/20" />
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">No habit stacks yet</h3>
                    <p className="text-white/50 max-w-md mx-auto mb-6">Create your first habit stack by linking a new behavior to an existing routine.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {stacks.map((stack) => (
                        <div key={stack.id} className="p-4 sm:p-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm flex items-center justify-between group">
                            <div className="flex items-center gap-4">
                                <button onClick={() => completeStack(stack.id)} className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:border-orange-500 hover:text-orange-500 transition-colors">
                                    <Circle className="w-5 h-5" />
                                </button>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium text-white/50">After I</span>
                                        <span className="font-semibold text-white">{stack.trigger_habit}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white/50">I will</span>
                                        <span className="font-semibold text-orange-400">{stack.action_habit}</span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60">{stack.action_duration_mins}m</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-white">{stack.current_streak}</div>
                                    <div className="text-xs font-medium text-white/40 uppercase tracking-wider">Streak</div>
                                </div>
                                <button className="p-2 text-white/40 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
