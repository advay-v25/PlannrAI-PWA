'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Sparkles, ArrowRight, Check, X, Battery, Activity, Clock, Zap, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { apiClient } from '@/lib/api-client';

interface DayOptimizerProps {
    date: Date;
    onClose: () => void;
    onApply: () => void;
    context: any; // User context for AI
}

interface OptimizationResult {
    analysis: {
        energy_state: string;
        schedule_health: 'balanced' | 'packed' | 'loose' | 'conflict';
        flow_opportunity: string;
    };
    strategy: {
        main_focus: string;
        changes_made: string;
        reality_check_applied: boolean;
    };
    patch: any;
}

export function DayOptimizerModal({ date, onClose, onApply, context }: DayOptimizerProps) {
    const [step, setStep] = useState<'analyzing' | 'review' | 'applying'>('analyzing');
    const [result, setResult] = useState<OptimizationResult | null>(null);

    // Auto-start analysis
    useState(() => {
        const runOptimization = async () => {
            try {
                const response = await apiClient.ai.execute({
                    channel: 'calendar.optimize',
                    input: `Optimize my day for ${format(date, 'yyyy-MM-dd')}`,
                    context: {
                        ...context,
                        current_time: new Date().toISOString()
                    }
                }) as unknown as OptimizationResult;

                setResult(response);
                setStep('review');
            } catch (err) {
                console.error("Optimization failed", err);
                onClose(); // Or show error state
            }
        };
        runOptimization();
    });

    const handleApply = async () => {
        if (!result?.patch) return;
        setStep('applying');
        try {
            await apiClient.patch.apply(result.patch, 'day_optimizer');
            onApply();
            onClose();
        } catch (err) {
            console.error("Failed to apply patch", err);
            onClose();
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

                            {/* Strategy Narrative */}
                            <GlassCard padding="md" className="bg-[var(--color-primary)]/5">
                                <div className="flex items-start gap-3">
                                    <Activity className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-sm mb-1">{result.strategy.main_focus}</h4>
                                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                            {result.strategy.changes_made}
                                        </p>
                                    </div>
                                </div>
                            </GlassCard>

                            {/* Reality Check Alert */}
                            {result.strategy.reality_check_applied && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                                    <p className="text-xs text-orange-200">
                                        <strong>Reality Check:</strong> Unfinished past tasks were pushed forward.
                                    </p>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-2">
                                <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
                                    Cancel
                                </GlassButton>
                                <GlassButton variant="primary" className="flex-[2]" onClick={handleApply}>
                                    <Check className="w-4 h-4 mr-2" />
                                    Apply Optimization
                                </GlassButton>
                            </div>
                        </div>
                    )}

                    {step === 'applying' && (
                        <div className="py-12 text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
                                <Check className="w-8 h-8 text-[var(--color-success)] animate-pulse" />
                            </div>
                            <p className="text-sm font-medium">Reshaping your day...</p>
                        </div>
                    )}

                </GlassCard>
            </motion.div>
        </div>
    );
}
