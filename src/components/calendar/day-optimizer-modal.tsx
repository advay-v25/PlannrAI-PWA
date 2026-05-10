'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Sparkles, ArrowRight, Check, X, Battery, Activity, Clock, Zap, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import type { Patch } from '@/lib/ai/schemas';

export interface CalendarOption {
    id: string;
    label: string;
    description: string;
    tradeoff: string;
    patch: Patch;
}

interface DayOptimizerProps {
    date: Date;
    onClose: () => void;
    onApply: (option: CalendarOption) => void;
    optimizeDay: (focus?: string) => Promise<any>;
}

export function DayOptimizerModal({ date, onClose, onApply, optimizeDay }: DayOptimizerProps) {
    const [step, setStep] = useState<'mode' | 'analyzing' | 'review'>('mode');
    const [selectedMode, setSelectedMode] = useState<'balanced' | 'momentum' | 'recovery'>('balanced');
    const [result, setResult] = useState<any>(null);
    const [selectedOption, setSelectedOption] = useState<CalendarOption | null>(null);

    // Stable refs to avoid re-firing the effect when parent re-renders
    const optimizeDayRef = useRef(optimizeDay);
    const onCloseRef = useRef(onClose);
    optimizeDayRef.current = optimizeDay;
    onCloseRef.current = onClose;

    const loadingTexts = [
        "Reading constraints & commitments...",
        "Analyzing flow state & energy arc...",
        "Generating optimized blocks...",
        "Finalizing schedule options..."
    ];
    const [loadingStage, setLoadingStage] = useState(0);

    useEffect(() => {
        if (step !== 'analyzing') return;
        const interval = setInterval(() => {
            setLoadingStage(prev => (prev + 1) % loadingTexts.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [step]);

    const handleGenerate = async () => {
        setStep('analyzing');
        try {
            const res = await optimizeDayRef.current(selectedMode);
            if (res) {
                setResult(res);
                if (res.options && res.options.length > 0) {
                    setSelectedOption(res.options[0]);
                }
                setStep('review');
            } else {
                onCloseRef.current();
            }
        } catch (err: any) {
            console.error("Optimization failed", err);
            onCloseRef.current();
        }
    };

    const handleApply = async () => {
        if (selectedOption) {
            onApply(selectedOption);
        }
    };

    const ModeCard = ({ mode, icon: Icon, title, desc }: any) => (
        <button
            onClick={() => setSelectedMode(mode)}
            className={`w-full p-4 rounded-xl border text-left transition-all ${selectedMode === mode
                ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                : 'bg-white/5 border-white/5 hover:bg-white/10'
                }`}
        >
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${selectedMode === mode ? 'bg-[var(--color-primary)] text-white' : 'bg-white/10 text-[var(--text-tertiary)]'}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <span className="font-bold capitalize">{title}</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg"
                onClick={e => e.stopPropagation()}
            >
                <GlassCard padding="lg" className="space-y-6">

                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/20 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">Day Architect</h3>
                                <p className="text-xs text-[var(--text-tertiary)]">AI Performance Coach</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
                            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        {step === 'mode' && (
                            <motion.div
                                key="mode"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-4"
                            >
                                <p className="text-sm text-[var(--text-secondary)]">
                                    How do you want to optimize today?
                                </p>
                                <div className="space-y-3">
                                    <ModeCard
                                        mode="balanced"
                                        icon={Activity}
                                        title="Balanced Flow"
                                        desc="Sustainable mix of deep work and rest. Recommended."
                                    />
                                    <ModeCard
                                        mode="momentum"
                                        icon={Zap}
                                        title="Momentum"
                                        desc="Maximize output. Tighten the schedule and push harder."
                                    />
                                    <ModeCard
                                        mode="recovery"
                                        icon={Battery}
                                        title="Recovery Mode"
                                        desc="Reduce overwhelm. Focus on essentials and active recovery."
                                    />
                                </div>
                                <GlassButton variant="primary" className="w-full mt-4" onClick={handleGenerate}>
                                    Optimize Schedule <ArrowRight className="w-4 h-4 ml-2" />
                                </GlassButton>
                            </motion.div>
                        )}

                        {step === 'analyzing' && (
                            <motion.div
                                key="analyzing"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="py-12 text-center space-y-4"
                            >
                                <div className="w-16 h-16 mx-auto rounded-full border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin" />
                                <motion.p 
                                    key={loadingStage}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="text-sm font-medium animate-pulse"
                                >
                                    {loadingTexts[loadingStage]}
                                </motion.p>
                            </motion.div>
                        )}

                        {step === 'review' && result && (
                            <motion.div 
                                key="review"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >

                                {/* Analysis Cards */}
                                {result.analysis && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <GlassCard padding="sm" className={`border-l-4 ${result.analysis.schedule_health === 'balanced' ? 'border-green-400' : 'border-orange-400'}`}>
                                            <p className="text-xs uppercase text-[var(--text-tertiary)] mb-1">Health</p>
                                            <p className="font-bold capitalize">{result.analysis.schedule_health}</p>
                                        </GlassCard>
                                        <GlassCard padding="sm" className="border-l-4 border-blue-400">
                                            <p className="text-xs uppercase text-[var(--text-tertiary)] mb-1">Energy State</p>
                                            <p className="font-bold">{result.analysis.energy_state}</p>
                                        </GlassCard>
                                    </div>
                                )}

                                {/* Warnings Alert */}
                                {result.warnings && result.warnings.length > 0 && (
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                                        <p className="text-xs text-orange-200">
                                            {result.warnings.join(' ')}
                                        </p>
                                    </div>
                                )}

                                {/* Selection Options */}
                                <div className="space-y-4">
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        Choose an optimization strategy:
                                    </p>
                                    <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {result.options?.map((opt: CalendarOption, i: number) => (
                                            <button
                                                key={i}
                                                onClick={() => setSelectedOption(opt)}
                                                className={`w-full p-4 rounded-xl border text-left transition-all ${selectedOption?.id === opt.id
                                                    ? 'bg-[var(--color-success)]/10 border-[var(--color-success)] shadow-lg shadow-[var(--color-success)]/10'
                                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold">{opt.label}</h4>
                                                    {selectedOption?.id === opt.id && <Check className="w-4 h-4 text-[var(--color-success)]" />}
                                                </div>
                                                <p className="text-xs text-[var(--text-secondary)] mb-2">{opt.description}</p>
                                                <p className="text-[10px] text-[var(--text-tertiary)] italic">Tradeoff: {opt.tradeoff}</p>
                                                <div className="mt-2 flex gap-2">
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[var(--text-tertiary)]">
                                                        {opt.patch?.ops?.length || 0} Block Changes
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-2">
                                    <GlassButton variant="ghost" className="flex-1" onClick={() => setStep('mode')}>
                                        Back
                                    </GlassButton>
                                    <GlassButton variant="primary" className="flex-[2]" onClick={handleApply} disabled={!selectedOption}>
                                        <Check className="w-4 h-4 mr-2" />
                                        Apply Strategy
                                    </GlassButton>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </GlassCard>
            </motion.div>
        </div>
    );
}
