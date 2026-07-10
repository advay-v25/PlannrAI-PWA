import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    X,
    ArrowRight,
    Calendar,
    List,
    RefreshCw,
    ChevronLeft,
    AlertCircle,
    Brain,
    Play,
    Check,
    Clock
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Goal } from '@/types/database';

interface GoalStrategyWizardProps {
    goal: Goal;
    isOpen: boolean;
    onClose: () => void;
    onStrategyApplied: (strategy: Record<string, any>) => void;
    context?: {
        profile?: any;
    };
}

type WizardStep = 'intro' | 'analyzing' | 'review';

interface GoalStrategy {
    strategy_one_liner: string;
    routine: {
        frequency: string;
        duration_mins: number;
        steps: string[];
        best_time?: string;
        notes?: string;
    };
    milestones: string[];
    checklist: { text: string }[];
    donna_note?: string;
}

export function GoalStrategyWizard({ goal, isOpen, onClose, onStrategyApplied }: GoalStrategyWizardProps) {
    const { showToast } = useToast();
    const [step, setStep] = useState<WizardStep>('intro');

    // Strategy State
    const [strategy, setStrategy] = useState<GoalStrategy | null>(
        goal.ai_strategy ? goal.ai_strategy as unknown as GoalStrategy : null
    );

    // UI State
    const [isGenerating, setIsGenerating] = useState(false);

    // 1. Generate Strategy — API saves directly to DB
    const handleGenerate = async () => {
        setStep('analyzing');
        setIsGenerating(true);

        try {
            const response = await apiClient.post<{ strategy: GoalStrategy }>('/api/goals/strategy', {
                goal_id: goal.id
            });

            if (response.strategy) {
                setStrategy(response.strategy);
                onStrategyApplied(response.strategy);
                setStep('review');
            } else {
                throw new Error('No strategy returned');
            }
        } catch (error: any) {
            console.error('Strategy Generation Failed:', error);
            showToast(error.message || 'Failed to generate strategy', 'error');
            setStep('intro');
        } finally {
            setIsGenerating(false);
        }
    };



    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <GlassCard className="w-full max-w-lg min-h-[500px] flex flex-col" padding="lg">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        {step === 'review' && (
                            <button onClick={() => setStep('intro')} className="p-1 hover:bg-[var(--glass-bg)] dark:hover:bg-white/10 rounded-full mr-1">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        )}
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                            Expert Strategist
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--glass-bg)] dark:hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    <AnimatePresence mode="wait">

                        {/* STEP 1: INTRO */}
                        {step === 'intro' && (
                            <motion.div
                                key="intro"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 flex flex-col justify-center items-center text-center space-y-8"
                            >
                                <div className="space-y-4 max-w-xs">
                                    <div className="w-24 h-24 mx-auto rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center animate-pulse-slow">
                                        <Brain className="w-12 h-12 text-[var(--color-primary)]" />
                                    </div>
                                    <h3 className="text-2xl font-bold">Unlocking &quot;{goal.title}&quot;</h3>
                                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                        I will break this goal down into a concrete <span className="text-[var(--text-primary)] font-bold">protocol</span>, <span className="text-[var(--text-primary)] font-bold">checklist</span>, and specific <span className="text-[var(--text-primary)] font-bold">milestones</span>.
                                    </p>
                                </div>

                                <GlassButton variant="primary" size="lg" onClick={handleGenerate} className="w-full max-w-sm h-12 text-base shadow-xl shadow-[var(--color-primary)]/20">
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    Generate Strategy
                                </GlassButton>

                                {strategy && (
                                    <button onClick={() => setStep('review')} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] dark:hover:text-white underline flex items-center gap-1">
                                        <Play className="w-3 h-3" /> View Active Strategy
                                    </button>
                                )}
                            </motion.div>
                        )}

                        {/* STEP 2: ANALYZING (Loading) */}
                        {step === 'analyzing' && (
                            <motion.div
                                key="analyzing"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex-1 flex flex-col justify-center items-center text-center space-y-6"
                            >
                                <div className="relative">
                                    <div className="w-20 h-20 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Sparkles className="w-8 h-8 text-[var(--color-primary)] animate-pulse" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-medium">Consulting Expert Models...</h3>
                                    <p className="text-xs text-[var(--text-tertiary)]">Analyzing complexity, energy demand, and best practices.</p>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 3: REVIEW — shows directly after generation */}
                        {step === 'review' && strategy && (
                            <motion.div
                                key="review"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05 }}
                                className="flex-1 space-y-5 overflow-y-auto pr-2 custom-scrollbar"
                            >
                                <div className="text-center space-y-2">
                                    <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-2">
                                        <Check className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-xl font-bold">Strategy Active</h3>
                                </div>

                                {/* One-liner */}
                                <div className="p-4 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-center shadow-lg shadow-[var(--color-primary)]/5">
                                    <h4 className="text-[var(--color-primary)] font-bold text-lg">&quot;{strategy.strategy_one_liner}&quot;</h4>
                                </div>

                                {/* Donna Note */}
                                {strategy.donna_note && (
                                    <div className="flex gap-2 text-xs text-blue-300 bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                                        <Brain className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>{strategy.donna_note}</span>
                                    </div>
                                )}

                                {/* Routine */}
                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold uppercase text-[var(--text-tertiary)] flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> {strategy.routine.frequency} Protocol
                                        <span className="ml-auto text-[var(--color-primary)] flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {strategy.routine.duration_mins}m
                                        </span>
                                    </h5>
                                    <div className="space-y-2 text-sm bg-[var(--glass-bg)] dark:bg-white/5 p-4 rounded-xl border border-[var(--glass-border)] dark:border-white/5">
                                        {strategy.routine.steps.map((s: string, i: number) => (
                                            <div key={i} className="flex gap-3">
                                                <span className="font-mono text-[var(--color-primary)] font-bold">{i + 1}.</span>
                                                <span className="text-[var(--text-primary)] dark:text-white/90">{s}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {strategy.routine.notes && (
                                        <div className="flex gap-2 text-xs text-amber-300 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                            {strategy.routine.notes}
                                        </div>
                                    )}
                                </div>

                                {/* Milestones */}
                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold uppercase text-[var(--text-tertiary)] flex items-center gap-2">
                                        <ArrowRight className="w-4 h-4" /> Milestones
                                    </h5>
                                    <div className="space-y-2 text-sm">
                                        {strategy.milestones.map((m: string, i: number) => (
                                            <div key={i} className="flex items-center gap-3 bg-[var(--glass-bg)] dark:bg-white/5 p-3 rounded-lg border border-[var(--glass-border)] dark:border-white/5">
                                                <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] flex items-center justify-center text-xs font-bold">{i + 1}</div>
                                                <span className="text-[var(--text-primary)] dark:text-white/80">{m}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Checklist */}
                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold uppercase text-[var(--text-tertiary)] flex items-center gap-2">
                                        <List className="w-4 h-4" /> Pre-Flight Checklist
                                    </h5>
                                    <ul className="space-y-1 bg-[var(--glass-bg)] dark:bg-white/5 p-4 rounded-xl border border-[var(--glass-border)] dark:border-white/5">
                                        {strategy.checklist.map((item: { text: string }, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-sm">
                                                <div className="w-4 h-4 mt-0.5 rounded border border-[var(--glass-border)] dark:border-white/20 shrink-0" />
                                                <span className="text-[var(--text-primary)] dark:text-white/80">{item.text}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <GlassButton variant="ghost" onClick={handleGenerate} disabled={isGenerating} className="flex-shrink-0">
                                        <RefreshCw className={`w-4 h-4 mr-1 ${isGenerating ? 'animate-spin' : ''}`} /> Regenerate
                                    </GlassButton>
                                    <GlassButton variant="primary" className="flex-1 h-12 text-base" onClick={onClose}>
                                        Done <Check className="w-4 h-4 ml-2" />
                                    </GlassButton>
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </GlassCard>
        </div>
    );
}
