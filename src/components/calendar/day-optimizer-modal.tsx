'use client';

import { useState, useEffect } from 'react';
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
    optimizeDay: (focus?: string) => Promise<any>; // Actually returns { analysis, options, warnings }
}

export function DayOptimizerModal({ date, onClose, onApply, optimizeDay }: DayOptimizerProps) {
    const [step, setStep] = useState<'analyzing' | 'review'>('analyzing');
    const [result, setResult] = useState<any>(null);
    const [selectedOption, setSelectedOption] = useState<CalendarOption | null>(null);

    // Auto-start analysis
    useEffect(() => {
        let isMounted = true;
        const runOptimization = async () => {
            try {
                const res = await optimizeDay();
                if (isMounted && res) {
                    setResult(res);
                    if (res.options && res.options.length > 0) {
                        setSelectedOption(res.options[0]);
                    }
                    setStep('review');
                }
            } catch (err: any) {
                console.error("Optimization failed", err);
                if (isMounted) onClose();
            }
        };
        runOptimization();
        return () => { isMounted = false; };
    }, [optimizeDay, onClose]);

    const handleApply = async () => {
        if (selectedOption) {
            onApply(selectedOption);
        }
    };

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

                    {step === 'analyzing' && (
                        <div className="py-12 text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin" />
                            <p className="text-sm font-medium animate-pulse">Analyzing your energy & schedule...</p>
                        </div>
                    )}

                    {step === 'review' && result && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

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
                                <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
                                    Cancel
                                </GlassButton>
                                <GlassButton variant="primary" className="flex-[2]" onClick={handleApply} disabled={!selectedOption}>
                                    <Check className="w-4 h-4 mr-2" />
                                    Apply Strategy
                                </GlassButton>
                            </div>
                        </div>
                    )}
                </GlassCard>
            </motion.div>
        </div>
    );
}
