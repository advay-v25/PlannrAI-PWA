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
    Check
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Goal, GoalCapacity } from '@/types/database';
import type { Patch } from '@/lib/ai/schemas';
import { StrategyOptionCard } from './strategy-option-card';

interface GoalStrategyWizardProps {
    goal: Goal;
    isOpen: boolean;
    onClose: () => void;
    onStrategyApplied: (strategy: Record<string, any>) => void;
    context?: {
        capacity?: GoalCapacity;
        profile?: any;
    };
}

type WizardStep = 'intro' | 'analyzing' | 'selection' | 'review' | 'schedule';

export function GoalStrategyWizard({ goal, isOpen, onClose, onStrategyApplied, context }: GoalStrategyWizardProps) {
    const { showToast } = useToast();
    const [step, setStep] = useState<WizardStep>('intro');

    // AI Data State
    const [aiOptions, setAiOptions] = useState<{ label: string; patch: Patch; explanation?: string }[]>([]);
    const [aiExplanation, setAiExplanation] = useState<string>('');
    const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);

    // Persisted Strategy State
    const [strategy, setStrategy] = useState<any>(goal.ai_strategy || null);

    // UI State
    const [isGenerating, setIsGenerating] = useState(false);
    const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);
    const [scheduleTime, setScheduleTime] = useState('09:00');
    const [isScheduling, setIsScheduling] = useState(false);

    // 1. Generate Strategy
    const handleGenerate = async () => {
        setStep('analyzing');
        setIsGenerating(true);
        setAiOptions([]); // Reset

        try {
            // Call BFF Endpoint
            const response = await apiClient.post<any>('/api/goals/strategy', {
                goal_id: goal.id,
                mode: 'expert'
            });

            if (response.options && response.options.length > 0) {
                setAiOptions(response.options);
                setAiExplanation(response.explanation || "Select a strategy to execute.");
                setStep('selection');
            } else {
                throw new Error("AI returned no options.");
            }
        } catch (error: any) {
            console.error("Strategy Generation Failed:", error);
            showToast(error.message || "Failed to generate strategies", 'error');
            setStep('intro');
        } finally {
            setIsGenerating(false);
        }
    };

    // 2. Apply Selected Option
    const handleApplyOption = async (option: any, index: number) => {
        try {
            const patch: Patch = option.patch;

            // 1. Search for value in the patch ops
            const updateOp = patch.ops.find((op: any) => op.op === 'update_goal');

            if (updateOp && 'fields' in updateOp && updateOp.fields.ai_strategy) {
                const newStrategy = updateOp.fields.ai_strategy;
                setStrategy(newStrategy);
                setSelectedOptionIndex(index);

                // 2. Apply Patch to DB
                await apiClient.patch.apply(patch, 'goal_strategy');

                // 3. Update Parent
                onStrategyApplied(newStrategy);

                // 4. Move to Review/Schedule
                // Slight delay for UX "Success" feel
                setTimeout(() => {
                    setStep('review');
                }, 800);
            } else {
                // Fallback if patch is generic (just notes)
                showToast("Strategy applied, but no structured data found.", "info");
                setStep('intro');
            }
        } catch (e: any) {
            showToast("Failed to apply strategy: " + e.message, "error");
            throw e; // Bubble to Card for error state
        }
    };

    // 3. Schedule Initial Block
    const handleSchedule = async () => {
        setIsScheduling(true);
        try {
            const startD = new Date(`${scheduleDate}T${scheduleTime}:00`);
            const endD = new Date(startD.getTime() + (goal.minutes_per_day || 60) * 60000);

            const patch: Patch = {
                undoable: true,
                ops: [{
                    op: 'create_event',
                    payload: {
                        title: goal.title,
                        start_time: startD.toISOString(),
                        end_time: endD.toISOString(),
                        block_type: 'goal',
                        goal_id: goal.id
                    }
                }],
                reason: "Initial Goal Strategy Block"
            };

            await apiClient.patch.apply(patch, 'goal_schedule');
            showToast('✅ Scheduled first session!', 'success');
            onClose();
        } catch (error) {
            showToast('Failed to schedule session', 'error');
        } finally {
            setIsScheduling(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <GlassCard className="w-full max-w-lg min-h-[500px] flex flex-col" padding="lg">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        {(step === 'selection' || step === 'review' || step === 'schedule') && (
                            <button onClick={() => setStep('intro')} className="p-1 hover:bg-white/10 rounded-full mr-1">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        )}
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                            Expert Strategist
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
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
                                    <h3 className="text-2xl font-bold">Unlocking "{goal.title}"</h3>
                                    <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                                        I will break this goal down into a concrete <span className="text-white font-bold">protocol</span>, <span className="text-white font-bold">checklist</span>, and specific <span className="text-white font-bold">milestones</span>.
                                    </p>
                                </div>

                                <GlassButton variant="primary" size="lg" onClick={handleGenerate} className="w-full max-w-sm h-12 text-base shadow-xl shadow-[var(--color-primary)]/20">
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    Generate Strategy
                                </GlassButton>

                                {strategy && (
                                    <button onClick={() => setStep('review')} className="text-xs text-[var(--text-tertiary)] hover:text-white underline flex items-center gap-1">
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

                        {/* STEP 3: SELECTION */}
                        {step === 'selection' && (
                            <motion.div
                                key="selection"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex-1 flex flex-col h-full"
                            >
                                {aiOptions.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                                        <AlertCircle className="w-12 h-12 text-[var(--text-tertiary)]" />
                                        <p className="text-[var(--text-secondary)]">{aiExplanation}</p>
                                        <GlassButton variant="ghost" onClick={() => setStep('intro')}>Try Again</GlassButton>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2 mb-4">
                                            <h3 className="text-sm font-bold uppercase text-[var(--text-tertiary)]">Available Strategies</h3>
                                            <p className="text-xs text-[var(--text-secondary)]">{aiExplanation}</p>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                            {aiOptions.map((option, idx) => (
                                                <StrategyOptionCard
                                                    key={idx}
                                                    option={option}
                                                    onApply={() => handleApplyOption(option, idx)}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        )}

                        {/* STEP 4: REVIEW */}
                        {step === 'review' && strategy && (
                            <motion.div
                                key="review"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05 }}
                                className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar"
                            >
                                <div className="text-center space-y-2">
                                    <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-2">
                                        <Check className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-xl font-bold">Strategy Active</h3>
                                </div>

                                {/* Results */}
                                <div className="p-4 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-center shadow-lg shadow-[var(--color-primary)]/5">
                                    <h4 className="text-[var(--color-primary)] font-bold text-lg">"{strategy.strategy_one_liner}"</h4>
                                </div>

                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold uppercase text-[var(--text-tertiary)] flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> Daily Protocol
                                    </h5>
                                    <div className="space-y-2 text-sm bg-white/5 p-4 rounded-xl border border-white/5">
                                        {strategy.routine?.steps?.map((s: string, i: number) => (
                                            <div key={i} className="flex gap-3">
                                                <span className="font-mono text-[var(--color-primary)] font-bold">{i + 1}.</span>
                                                <span className="text-white/90">{s}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {strategy.routine?.notes && (
                                        <div className="flex gap-2 text-xs text-amber-300 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                            {strategy.routine.notes}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold uppercase text-[var(--text-tertiary)] flex items-center gap-2">
                                        <List className="w-4 h-4" /> Pre-Flight Checklist
                                    </h5>
                                    <ul className="space-y-1 bg-white/5 p-4 rounded-xl border border-white/5">
                                        {strategy.checklist?.map((item: any, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-sm">
                                                <div className="w-4 h-4 mt-0.5 rounded border border-white/20 shrink-0" />
                                                <span className="text-white/80">{item.text}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <GlassButton variant="primary" className="w-full h-12 text-base" onClick={() => setStep('schedule')}>
                                    Schedule First Session <ArrowRight className="w-4 h-4 ml-2" />
                                </GlassButton>
                            </motion.div>
                        )}

                        {/* STEP 5: SCHEDULE */}
                        {step === 'schedule' && (
                            <motion.div
                                key="schedule"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex-1 flex flex-col justify-center space-y-6"
                            >
                                <div className="text-center space-y-2">
                                    <h3 className="text-lg font-bold">Let's make it real.</h3>
                                    <p className="text-sm text-[var(--text-tertiary)]">Commitment is the first step modification.</p>
                                </div>

                                <div className="bg-white/5 p-6 rounded-xl space-y-4 border border-white/10">
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">Start Date</label>
                                        <input
                                            type="date"
                                            value={scheduleDate}
                                            onChange={(e) => setScheduleDate(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 text-white focus:border-[var(--color-primary)] outline-none transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">Start Time</label>
                                        <input
                                            type="time"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 text-white focus:border-[var(--color-primary)] outline-none transition-colors"
                                        />
                                    </div>
                                </div>

                                <GlassButton
                                    variant="primary"
                                    className="w-full h-12 text-base"
                                    onClick={handleSchedule}
                                    disabled={isScheduling}
                                >
                                    {isScheduling ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
                                    {isScheduling ? 'Scheduling...' : 'Confirm Session'}
                                </GlassButton>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </GlassCard>
        </div>
    );
}

