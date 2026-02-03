'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Sparkles, CheckCircle2, Clock, ArrowRight, Sun, Coffee, Zap } from 'lucide-react';

interface BriefingData {
    greeting: string;
    agenda: Array<{ time: string; task: string; status: string }>;
    priorities: string[];
    insight: string;
    tone: string;
    suggestedBreakfast?: string;
    morningRoutineTips?: string[];
}

export function MorningBriefing() {
    const [isVisible, setIsVisible] = useState(false);
    const [data, setData] = useState<BriefingData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const checkBriefing = async () => {
            const today = new Date().toISOString().split('T')[0];
            const lastBriefing = localStorage.getItem('last_morning_briefing');

            // Only show if not seen today
            if (lastBriefing !== today) {
                setIsLoading(true);
                try {
                    const res = await fetch('/api/ai/morning-briefing', {
                        method: 'POST',
                    });

                    if (res.ok) {
                        const json = await res.json();
                        if (json.briefing) {
                            setData(json.briefing);
                            setIsVisible(true);
                        }
                    }
                } catch (error) {
                    console.error('Failed to load briefing:', error);
                } finally {
                    setIsLoading(false);
                }
            }
        };

        // Small delay to let the app load first
        const timer = setTimeout(checkBriefing, 1000);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('last_morning_briefing', today);
        setIsVisible(false);
    };

    return (
        <AnimatePresence>
            {isVisible && data && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="w-full max-w-2xl"
                    >
                        <GlassCard variant="glow" padding="lg" className="relative overflow-hidden max-h-[85vh] overflow-y-auto custom-scrollbar">
                            {/* Background Ambient Glow */}
                            <div className={`absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-[100px] pointer-events-none 
                                ${data.tone === 'energetic' ? 'bg-orange-500' :
                                    data.tone === 'calm' ? 'bg-blue-500' : 'bg-purple-500'}`} />

                            <div className="relative z-10 space-y-8">
                                {/* Header */}
                                <div className="text-center space-y-2">
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        className="flex justify-center mb-4"
                                    >
                                        <div className="p-3 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                            <Sun className="w-8 h-8 text-[var(--color-primary)]" />
                                        </div>
                                    </motion.div>

                                    <motion.h2
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className="text-3xl md:text-4xl font-display font-medium"
                                    >
                                        {data.greeting}
                                    </motion.h2>

                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className="text-lg text-[var(--text-secondary)] italic max-w-lg mx-auto"
                                    >
                                        "{data.insight}"
                                    </motion.p>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Agenda */}
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.5 }}
                                        className="space-y-4"
                                    >
                                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                            <Clock className="w-4 h-4" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Today's Agenda</span>
                                        </div>
                                        <div className="space-y-3">
                                            {data.agenda.length > 0 ? (
                                                data.agenda.slice(0, 3).map((item, i) => (
                                                    <div key={i} className="flex gap-3 text-sm">
                                                        <span className="font-mono text-[var(--text-tertiary)]">{item.time}</span>
                                                        <span className="font-medium">{item.task}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-[var(--text-tertiary)]">No fixed events scheduled.</p>
                                            )}
                                            {data.agenda.length > 3 && (
                                                <p className="text-xs text-[var(--text-tertiary)] pt-1">
                                                    + {data.agenda.length - 3} more items
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>

                                    {/* Priorities */}
                                    <motion.div
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.6 }}
                                        className="space-y-4"
                                    >
                                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                            <Sparkles className="w-4 h-4" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Top Priorities</span>
                                        </div>
                                        <div className="space-y-3">
                                            {data.priorities.map((item, i) => (
                                                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                                    <div className="mt-0.5 min-w-4 min-h-4 rounded border-2 border-[var(--text-tertiary)]" />
                                                    <span className="text-sm">{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                </div>

                                {/* Breakfast & Morning Tips Row */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Suggested Breakfast */}
                                    {data.suggestedBreakfast && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.65 }}
                                            className="p-4 rounded-xl bg-[var(--color-body)]/10 border border-[var(--color-body)]/20"
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <Coffee className="w-4 h-4 text-[var(--color-body)]" />
                                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-body)]">Breakfast Idea</span>
                                            </div>
                                            <p className="text-sm">{data.suggestedBreakfast}</p>
                                        </motion.div>
                                    )}

                                    {/* Morning Routine Tips */}
                                    {data.morningRoutineTips && data.morningRoutineTips.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.7 }}
                                            className="p-4 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20"
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <Zap className="w-4 h-4 text-[var(--color-primary)]" />
                                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">Morning Tips</span>
                                            </div>
                                            <ul className="space-y-1">
                                                {data.morningRoutineTips.map((tip, i) => (
                                                    <li key={i} className="text-sm flex items-start gap-2">
                                                        <span className="text-[var(--color-primary)]">•</span>
                                                        {tip}
                                                    </li>
                                                ))}
                                            </ul>
                                        </motion.div>
                                    )}
                                </div>

                                {/* Footer Action */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.8 }}
                                    className="flex justify-center pt-4"
                                >
                                    <GlassButton
                                        size="lg"
                                        variant="primary"
                                        onClick={handleDismiss}
                                        className="gap-2 px-8 min-w-[200px]"
                                    >
                                        Time to Focus
                                        <ArrowRight className="w-4 h-4" />
                                    </GlassButton>
                                </motion.div>
                            </div>
                        </GlassCard>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
