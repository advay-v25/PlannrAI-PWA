'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

interface InsightData {
    insight: string;
    archetype_signal: string;
    donna_note: string;
    profile_update?: {
        chronotype?: string;
        productivity_archetype?: string;
        energy_pattern?: string;
        risk_flag?: string;
    };
}

interface AIInsightTransitionProps {
    stepId: string;
    stepData: Record<string, any>;
    accumulatedData: Record<string, any>;
    onComplete: (insight: InsightData) => void;
    userName?: string;
}

export function AIInsightTransition({
    stepId,
    stepData,
    accumulatedData,
    onComplete,
    userName
}: AIInsightTransitionProps) {
    const [phase, setPhase] = useState<'thinking' | 'reveal' | 'done'>('thinking');
    const [insight, setInsight] = useState<InsightData | null>(null);
    const [typedText, setTypedText] = useState('');

    // Thinking messages that cycle
    const thinkingMessages = [
        "Analyzing your patterns...",
        "Cross-referencing with bio-rhythms...",
        "Building personality model...",
        "Calibrating Donna...",
    ];
    const [thinkingIdx, setThinkingIdx] = useState(0);

    // Cycle thinking messages
    useEffect(() => {
        if (phase !== 'thinking') return;
        const timer = setInterval(() => {
            setThinkingIdx(prev => (prev + 1) % thinkingMessages.length);
        }, 1000);
        return () => clearInterval(timer);
    }, [phase]);

    // Fetch insight on mount
    useEffect(() => {
        let mounted = true;

        const fetchInsight = async () => {
            try {
                const res = await fetch('/api/onboarding/insight', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step_id: stepId,
                        step_data: stepData,
                        accumulated_data: accumulatedData
                    })
                });

                const json = await res.json();
                const data = json.data || json;

                if (mounted) {
                    setInsight(data);
                    // Wait a minimum 1.5s in thinking state for UX
                    setTimeout(() => {
                        if (mounted) setPhase('reveal');
                    }, 500);
                }
            } catch (err) {
                console.error('[AIInsightTransition] Failed:', err);
                if (mounted) {
                    setInsight({
                        insight: 'Calibration data received. Moving to next phase.',
                        archetype_signal: '🔄 Processing',
                        donna_note: 'Fallback — AI unavailable.',
                        profile_update: {}
                    });
                    setTimeout(() => {
                        if (mounted) setPhase('reveal');
                    }, 500);
                }
            }
        };

        // Minimum 1.5s thinking time before we even check
        const minTimer = setTimeout(() => fetchInsight(), 1200);

        return () => {
            mounted = false;
            clearTimeout(minTimer);
        };
    }, [stepId]);

    // Typewriter effect for insight
    useEffect(() => {
        if (phase !== 'reveal' || !insight) return;
        let i = 0;
        const text = insight.insight;
        setTypedText('');
        const timer = setInterval(() => {
            i++;
            setTypedText(text.slice(0, i));
            if (i >= text.length) {
                clearInterval(timer);
                // Auto-advance after showing for 2s
                setTimeout(() => setPhase('done'), 2000);
            }
        }, 25);
        return () => clearInterval(timer);
    }, [phase, insight]);

    // When done, call onComplete
    useEffect(() => {
        if (phase === 'done' && insight) {
            onComplete(insight);
        }
    }, [phase, insight]);

    // Allow user to skip by clicking
    const handleSkip = useCallback(() => {
        if (insight) {
            onComplete(insight);
        }
    }, [insight, onComplete]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl"
            onClick={phase === 'reveal' ? handleSkip : undefined}
        >
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[var(--color-primary)]/10 rounded-full blur-[100px] animate-pulse" />
            </div>

            <div className="relative z-10 max-w-md w-full px-8 text-center">
                <AnimatePresence mode="wait">
                    {phase === 'thinking' && (
                        <motion.div
                            key="thinking"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1 }}
                            className="space-y-8"
                        >
                            {/* Spinning DNA helix */}
                            <div className="relative mx-auto w-20 h-20">
                                <div className="absolute inset-0 rounded-full border-2 border-[var(--color-primary)]/30 animate-[spin_3s_linear_infinite]" />
                                <div className="absolute inset-2 rounded-full border-2 border-[var(--color-primary)]/50 border-t-transparent animate-[spin_2s_linear_infinite_reverse]" />
                                <div className="absolute inset-4 rounded-full border-2 border-[var(--color-primary)]/70 animate-[spin_1.5s_linear_infinite]" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-[var(--color-primary)] animate-pulse" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-mono uppercase tracking-[0.3em] text-[var(--color-primary)]">
                                    Donna is calibrating
                                </p>
                                <motion.p
                                    key={thinkingIdx}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="text-sm text-[var(--text-secondary)] font-light h-5"
                                >
                                    {thinkingMessages[thinkingIdx]}
                                </motion.p>
                            </div>
                        </motion.div>
                    )}

                    {phase === 'reveal' && insight && (
                        <motion.div
                            key="reveal"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="space-y-8"
                        >
                            {/* Archetype badge */}
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                                className="inline-flex px-5 py-2.5 rounded-full bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/40 shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.2)]"
                            >
                                <span className="text-sm font-bold text-[var(--color-primary)] tracking-wide">
                                    {insight.archetype_signal}
                                </span>
                            </motion.div>

                            {/* Insight text with typewriter */}
                            <div className="min-h-[80px] flex items-center justify-center">
                                <p className="text-lg font-light text-white leading-relaxed">
                                    {typedText}
                                    <span className="animate-pulse text-[var(--color-primary)]">|</span>
                                </p>
                            </div>

                            {/* Tap to continue hint */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.5 }}
                                className="flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary)]"
                            >
                                <span>Tap to continue</span>
                                <ArrowRight className="w-3 h-3" />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
