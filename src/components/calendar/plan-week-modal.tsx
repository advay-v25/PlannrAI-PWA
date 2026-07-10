'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';
import type { Patch } from '@/lib/ai/schemas';
import {
    Calendar, Sparkles, X, Check, Loader2, ArrowRight, Zap, Battery, Activity, AlertTriangle
} from 'lucide-react';

export interface CalendarOption {
    id: string;
    label: string;
    description: string;
    tradeoff: string;
    analysis?: {
        unscheduled: Record<string, number>;
        total_hours: number;
        days_with_work: number;
    };
    patch: Patch;
}

interface PlanWeekModalProps {
    onClose: () => void;
    onApply: (option: CalendarOption) => void;
    planWeek: (options: { mode: 'balanced' | 'momentum' | 'recovery', allow_weekend?: boolean }) => Promise<{ summary: string, options: CalendarOption[], warnings: string[], note: string | undefined }>;
    context: any;
}

export function PlanWeekModal({ onClose, onApply, planWeek, context }: PlanWeekModalProps) {
    const [step, setStep] = useState<'mode' | 'generating' | 'selection'>('mode');
    const [selectedMode, setSelectedMode] = useState<'balanced' | 'momentum' | 'recovery'>('balanced');
    const [options, setOptions] = useState<CalendarOption[]>([]);
    const [selectedOption, setSelectedOption] = useState<CalendarOption | null>(null);

    const loadingTexts = [
        "Analyzing weekly constraints...",
        "Evaluating habit stacks...",
        "Drafting optimal schedules...",
        "Refining options..."
    ];
    const [loadingStage, setLoadingStage] = useState(0);

    useEffect(() => {
        if (step !== 'generating') return;
        const interval = setInterval(() => {
            setLoadingStage(prev => (prev + 1) % loadingTexts.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [step]);

    const handleGenerate = async () => {
        setStep('generating');
        try {
            // Call API via the passed hook function
            const result = await planWeek({
                mode: selectedMode,
                allow_weekend: true // Schedule the entire week, including weekends
            });

            if (result && result.options) {
                setOptions(result.options);
                if (result.options.length > 0) setSelectedOption(result.options[0]);
                setStep('selection');
            } else {
                console.warn("No options returned", result);
                onClose();
            }
        } catch (e) {
            console.error("Plan Week Failed", e);
            onClose();
        }
    };

    const handleApply = () => {
        if (selectedOption) {
            onApply(selectedOption); // Pass the entire option back to the hook
        }
    };

    const ModeCard = ({ mode, icon: Icon, title, desc }: any) => (
        <button
            onClick={() => setSelectedMode(mode)}
            className={`w-full p-4 rounded-xl text-left transition-all duration-300 hover:scale-[1.02] ${selectedMode === mode
                ? 'glass-panel bg-[var(--color-primary)]/10 border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                : 'glass-panel hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/[0.08] hover:border-[var(--color-primary)]/20 dark:hover:border-white/[0.15]'
                }`}
        >
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${selectedMode === mode ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--glass-bg)] dark:bg-white/10 text-[var(--text-tertiary)]'}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <span className="font-bold capitalize">{title}</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg"
                onClick={e => e.stopPropagation()}
            >
                <div className="glass-panel-elevated p-6 space-y-6 rounded-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--color-future)]/20 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-[var(--color-future)]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">Week Architect</h3>
                                <p className="text-xs text-[var(--text-tertiary)]">AI Strategic Planning</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-[var(--glass-bg)] dark:hover:bg-white/10 rounded-lg">
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
                                    How do you want to approach this week?
                                </p>

                                {/* Energy-aware mode suggestion */}
                                {context?.user_state?.energy_level && (
                                    <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                                        context.user_state.energy_level >= 4
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : context.user_state.energy_level <= 2
                                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    }`}>
                                        {context.user_state.energy_level >= 4 ? (
                                            <>
                                                <Zap className="w-3 h-3" />
                                                <span>High energy detected — <strong>Momentum</strong> recommended</span>
                                            </>
                                        ) : context.user_state.energy_level <= 2 ? (
                                            <>
                                                <Battery className="w-3 h-3" />
                                                <span>Low energy — <strong>Recovery</strong> recommended</span>
                                            </>
                                        ) : (
                                            <>
                                                <Activity className="w-3 h-3" />
                                                <span>Moderate energy — <strong>Balanced</strong> works well</span>
                                            </>
                                        )}
                                    </div>
                                )}
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
                                        desc="Maximize output. Minimal buffers. Use sparingly."
                                    />
                                    <ModeCard
                                        mode="recovery"
                                        icon={Battery}
                                        title="Recovery Mode"
                                        desc="Prioritize rest, lighten load, focus on essentials."
                                    />
                                </div>
                                <LiquidGlassButton variant="primary" size="md" className="w-full mt-4" onClick={handleGenerate}>
                                    Generate Plan <ArrowRight className="w-4 h-4 ml-2" />
                                </LiquidGlassButton>
                            </motion.div>
                        )}

                        {step === 'generating' && (
                            <motion.div
                                key="generating"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="py-12 text-center space-y-4"
                            >
                                <div className="relative w-20 h-20 mx-auto">
                                    <div className="absolute inset-0 rounded-full border border-purple-500/30 ring-loader-1" />
                                    <div className="absolute inset-2 rounded-full border border-[#d90479]/25 ring-loader-2" />
                                    <div className="absolute inset-4 rounded-full border border-amber-500/20 ring-loader-3" />
                                    <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-purple-400 animate-pulse" />
                                </div>
                                <motion.p 
                                    key={loadingStage}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="text-sm font-medium animate-crossfade-in"
                                >
                                    {loadingTexts[loadingStage]}
                                </motion.p>
                            </motion.div>
                        )}

                        {step === 'selection' && (
                            <motion.div
                                key="selection"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-4"
                            >
                                <p className="text-sm text-[var(--text-secondary)]">
                                    Choose the best plan for you:
                                </p>
                                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {options.map((opt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setSelectedOption(opt)}
                                            className={`w-full p-4 rounded-xl text-left transition-all duration-300 hover:scale-[1.02] ${selectedOption === opt
                                                ? 'glass-panel bg-[var(--color-success)]/10 border-[var(--color-success)] shadow-lg shadow-[var(--color-success)]/10'
                                                : 'glass-panel hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/[0.08] hover:border-[var(--color-primary)]/20 dark:hover:border-white/[0.15]'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="font-bold">{opt.label}</h4>
                                                {selectedOption === opt && <Check className="w-4 h-4 text-[var(--color-success)]" />}
                                            </div>
                                            <p className="text-xs text-[var(--text-secondary)]">{opt.description}</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--glass-bg)] dark:bg-white/5 text-[var(--text-tertiary)]">
                                                    {opt.patch?.ops.length || 0} Changes
                                                </span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--glass-bg)] dark:bg-white/5 text-[var(--text-tertiary)]">
                                                    {opt.analysis?.total_hours || 0}h Total
                                                </span>
                                            </div>
                                            
                                            {opt.analysis?.unscheduled && Object.keys(opt.analysis.unscheduled).length > 0 && (
                                                <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                    <p className="text-[10px] text-amber-400 font-bold mb-1 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" /> GAP ANALYSIS:
                                                    </p>
                                                    <div className="space-y-0.5">
                                                        {Object.entries(opt.analysis.unscheduled).map(([goal, mins]) => (
                                                            <p key={goal} className="text-[10px] text-amber-200/70">
                                                                • {goal}: {mins}m unfilled
                                                            </p>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <LiquidGlassButton variant="ghost" size="md" className="flex-1" onClick={() => setStep('mode')}>
                                        Back
                                    </LiquidGlassButton>
                                    <LiquidGlassButton variant="primary" size="md" className="flex-[2]" onClick={handleApply} disabled={!selectedOption}>
                                        Apply Plan
                                    </LiquidGlassButton>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}

// Re-export fab for compatibility or update usage
export function PlanWeekFAB({ onClick }: { onClick: () => void }) {
    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className="fixed bottom-6 right-6 md:bottom-12 md:right-12 w-14 h-14 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-future)] shadow-lg flex items-center justify-center z-40 hover:shadow-[var(--color-primary)]/40 transition-shadow"
        >
            <Sparkles className="w-6 h-6 text-white" />
        </motion.button>
    );
}
