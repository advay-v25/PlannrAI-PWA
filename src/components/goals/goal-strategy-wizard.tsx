import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    X,
    ArrowRight,
    Check,
    Calendar,
    List,
    Clock,
    RefreshCw,
    ChevronLeft,
    AlertCircle
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Goal } from '@/types/database';
import type { Patch } from '@/lib/ai/schemas';

interface GoalStrategyWizardProps {
    goal: Goal;
    isOpen: boolean;
    onClose: () => void;
    onStrategyApplied: (strategy: any) => void;
}

type WizardStep = 'intro' | 'analyzing' | 'review' | 'schedule';

export function GoalStrategyWizard({ goal, isOpen, onClose, onStrategyApplied }: GoalStrategyWizardProps) {
    const { showToast } = useToast();
    const [step, setStep] = useState<WizardStep>('intro');
    const [strategy, setStrategy] = useState<any>(goal.ai_strategy || null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Scheduling State
    const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);
    const [scheduleTime, setScheduleTime] = useState('09:00');
    const [isScheduling, setIsScheduling] = useState(false);

    // 1. Generate Strategy
    const handleGenerate = async () => {
        setStep('analyzing');
        setIsGenerating(true);

        try {
            const aiData = await apiClient.ai.execute({
                channel: 'goal_strategy',
                input: `Decompose goal: ${goal.title}`,
                context: {
                    goal_id: goal.id,
                    goal_title: goal.title,
                    goal_category: goal.category,
                    minutes_per_day: goal.minutes_per_day,
                    skill_level: 'Beginner' // Could come from profile
                }
            });

            if (aiData.options && aiData.options.length > 0) {
                const option = aiData.options[0];
                const patch: Patch = option.patch;

                // Extract strategy from patch op
                const updateOp = patch.ops.find((op: any) => op.op === 'update_goal');
                if (updateOp && 'fields' in updateOp && updateOp.fields.ai_strategy) {
                    const newStrategy = updateOp.fields.ai_strategy;
                    setStrategy(newStrategy);

                    // Auto-save strategy to DB via patch
                    await apiClient.patch.apply(patch, 'goal_strategy');
                    onStrategyApplied(newStrategy);

                    setStep('review');
                } else {
                    throw new Error("AI response missing strategy fields.");
                }
            } else {
                throw new Error("AI returned no options.");
            }
        } catch (error: any) {
            console.error("Strategy Generation Failed:", error);
            showToast(error.message || "Failed to generate strategy", 'error');
            setStep('intro'); // Reset
        } finally {
            setIsGenerating(false);
        }
    };

    // 2. Schedule Initial Block
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
            <GlassCard className="w-full max-w-lg min-h-[400px] flex flex-col" padding="lg">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        {step !== 'intro' && (
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
                <div className="flex-1 flex flex-col">
                    <AnimatePresence mode="wait">

                        {/* STEP 1: INTRO */}
                        {step === 'intro' && (
                            <motion.div
                                key="intro"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 flex flex-col justify-center items-center text-center space-y-6"
                            >
                                <div className="w-20 h-20 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center animate-pulse-slow">
                                    <Sparkles className="w-10 h-10 text-[var(--color-primary)]" />
                                </div>
                                <div className="space-y-2 max-w-xs">
                                    <h3 className="text-xl font-bold">Unlocking "{goal.title}"</h3>
                                    <p className="text-sm text-[var(--text-tertiary)]">
                                        I will break this goal down into a concrete protocol, pre-flight checklist, and milestones.
                                    </p>
                                </div>
                                <GlassButton variant="primary" size="lg" onClick={handleGenerate} className="w-full max-w-sm">
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Generate Strategy
                                </GlassButton>
                                {strategy && (
                                    <button onClick={() => setStep('review')} className="text-xs text-[var(--text-tertiary)] hover:text-white underline">
                                        View existing strategy
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
                                    <div className="w-16 h-16 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Sparkles className="w-6 h-6 text-[var(--color-primary)] animate-pulse" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-medium">Consulting Expert Models...</h3>
                                    <p className="text-xs text-[var(--text-tertiary)]">Analyzing complexity, energy demand, and effective protocols.</p>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 3: REVIEW */}
                        {step === 'review' && strategy && (
                            <motion.div
                                key="review"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 space-y-6 overflow-y-auto max-h-[50vh] pr-2 custom-scrollbar"
                            >
                                {/* Results */}
                                <div className="p-4 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-center">
                                    <h4 className="text-[var(--color-primary)] font-bold text-lg">"{strategy.strategy_one_liner}"</h4>
                                </div>

                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold uppercase text-[var(--text-tertiary)] flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> Daily Protocol
                                    </h5>
                                    <div className="space-y-2 text-sm bg-white/5 p-4 rounded-xl">
                                        {strategy.routine?.steps?.map((s: string, i: number) => (
                                            <div key={i} className="flex gap-3">
                                                <span className="font-mono text-[var(--color-primary)]">{i + 1}.</span>
                                                <span>{s}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {strategy.routine?.notes && (
                                        <div className="flex gap-2 text-xs text-yellow-400 bg-yellow-400/10 p-3 rounded-lg">
                                            <AlertCircle className="w-4 h-4" />
                                            {strategy.routine.notes}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold uppercase text-[var(--text-tertiary)] flex items-center gap-2">
                                        <List className="w-4 h-4" /> Pre-Flight Checklist
                                    </h5>
                                    <ul className="space-y-1 bg-white/5 p-4 rounded-xl">
                                        {strategy.checklist?.map((item: any, i: number) => (
                                            <li key={i} className="flex items-center gap-2 text-sm">
                                                <div className="w-4 h-4 rounded border border-white/20" />
                                                {item.text}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <GlassButton variant="primary" className="w-full" onClick={() => setStep('schedule')}>
                                    Schedule First Session <ArrowRight className="w-4 h-4 ml-2" />
                                </GlassButton>
                            </motion.div>
                        )}

                        {/* STEP 4: SCHEDULE */}
                        {step === 'schedule' && (
                            <motion.div
                                key="schedule"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 flex flex-col justify-center space-y-6"
                            >
                                <div className="text-center space-y-2">
                                    <h3 className="text-lg font-bold">Let's make it real.</h3>
                                    <p className="text-sm text-[var(--text-tertiary)]">When fully committing, start immediately.</p>
                                </div>

                                <div className="bg-white/5 p-6 rounded-xl space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase text-[var(--text-tertiary)]">Start Date</label>
                                        <input
                                            type="date"
                                            value={scheduleDate}
                                            onChange={(e) => setScheduleDate(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase text-[var(--text-tertiary)]">Start Time</label>
                                        <input
                                            type="time"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2"
                                        />
                                    </div>
                                </div>

                                <GlassButton
                                    variant="primary"
                                    className="w-full"
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
