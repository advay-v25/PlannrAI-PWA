'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, ArrowRight, ArrowLeft, Brain, Zap, Target, Star, AlertTriangle, MessageCircle, X } from 'lucide-react';
import { PageBackground } from '@/components/ui/PageBackground';

interface Goal {
    id: string;
    title: string;
    category: string;
}

const STEPS = [
    'Accomplishments',
    'Best Performance',
    'Struggles',
    'Priorities',
    'Feedback',
    'Execution'
] as const;

export default function WeeklyReviewSurvey() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExecuting, setIsExecuting] = useState(false);
    const [executingMode, setExecutingMode] = useState<'auto' | 'semi-auto' | 'manual' | null>(null);

    // Survey State
    const [accomplished, setAccomplished] = useState<'yes' | 'no' | 'partially' | null>(null);
    const [bestGoalId, setBestGoalId] = useState<string>('');
    const [worstGoalId, setWorstGoalId] = useState<string>('');
    const [priorityChange, setPriorityChange] = useState<'increase' | 'decrease' | 'no' | null>(null);
    const [feedbackText, setFeedbackText] = useState('');

    useEffect(() => {
        // Fetch active goals
        apiClient.get<{ goals: Goal[] }>('/api/goals')
            .then(res => setGoals(res.goals || []))
            .catch(err => console.error(err))
            .finally(() => setIsLoading(false));
    }, []);

    const wordCount = feedbackText.trim() ? feedbackText.trim().split(/\s+/).length : 0;

    const handleNext = () => {
        if (currentStep === 2 && worstGoalId === 'none') {
            setCurrentStep(4); // Skip priority question if no worst goal
        } else {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep === 4 && worstGoalId === 'none') {
            setCurrentStep(2); // Go back to worst goal question
        } else {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleExecute = async (mode: 'auto' | 'semi-auto' | 'manual') => {
        setIsExecuting(true);
        setExecutingMode(mode);
        const payload = {
            accomplished,
            bestGoalId,
            worstGoalId,
            priorityChange,
            feedbackText,
            mode
        };

        try {
            if (mode === 'auto') {
                toast.loading('Regenerating schedule with AI...', { id: 'exec' });
                await apiClient.post('/api/weekly-review/execute', payload);
                toast.success('Schedule regenerated successfully!', { id: 'exec' });
                router.push('/app/calendar');
            } else if (mode === 'semi-auto') {
                toast.loading('Updating priorities...', { id: 'exec' });
                await apiClient.post('/api/weekly-review/execute', payload);
                toast.success('Priorities updated. Please refine your goals.', { id: 'exec' });
                router.push('/app/goals');
            } else {
                // Manual
                toast.success('Review completed.', { id: 'exec' });
                if (feedbackText.trim()) {
                    localStorage.setItem('manual_review_feedback', feedbackText.trim());
                }
                router.push('/app');
            }
        } catch (e) {
            toast.error('Failed to execute review actions.', { id: 'exec' });
            setIsExecuting(false);
            setExecutingMode(null);
        }
    };

    const exitReview = () => {
        router.push('/app');
    };

    if (isLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    const isStepValid = () => {
        switch (currentStep) {
            case 0: return accomplished !== null;
            case 1: return bestGoalId !== '';
            case 2: return worstGoalId !== '';
            case 3: return priorityChange !== null;
            case 4: return wordCount <= 100;
            default: return true;
        }
    };

    return (
        <div className="max-w-2xl mx-auto pb-20 p-4 md:p-6 min-h-screen flex flex-col">
            <PageBackground color="purple" intensity="strong" />
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Weekly Review</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Reflect and recalibrate</p>
                </div>
                <button
                    onClick={exitReview}
                    className="p-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[var(--text-secondary)] transition-colors flex items-center gap-2 text-sm font-medium"
                >
                    <X className="w-4 h-4" /> Exit
                </button>
            </header>

            {/* Progress Bar */}
            <div className="flex gap-1.5 mb-8">
                {STEPS.map((step, i) => (
                    <div key={step} className="flex-1">
                        <div className={`h-1.5 rounded-full transition-all ${i <= currentStep ? 'bg-[var(--color-primary)]' : 'bg-[var(--glass-border)]'}`} />
                        <span className={`text-[10px] mt-1.5 block text-center hidden md:block transition-colors ${i === currentStep ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--text-tertiary)]'}`}>
                            {step}
                        </span>
                    </div>
                ))}
            </div>

            <div className="flex-1 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-8"
                    >
                        {/* Question 1: Accomplishments */}
                        {currentStep === 0 && (
                            <div className="space-y-6 text-center max-w-md mx-auto">
                                <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                                    <Target className="w-8 h-8 text-[var(--color-primary)]" />
                                </div>
                                <h2 className="text-2xl font-bold">Did you accomplish all you wanted to this week?</h2>
                                <div className="grid gap-3">
                                    {(['yes', 'partially', 'no'] as const).map(option => (
                                        <button
                                            key={option}
                                            onClick={() => setAccomplished(option)}
                                            className={`p-4 rounded-xl border text-sm font-bold capitalize transition-all ${
                                                accomplished === option
                                                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
                                            }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Question 2: Best Performance */}
                        {currentStep === 1 && (
                            <div className="space-y-6 text-center max-w-md mx-auto">
                                <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/10 flex items-center justify-center">
                                    <Star className="w-8 h-8 text-yellow-500" />
                                </div>
                                <h2 className="text-2xl font-bold">What did you do best on?</h2>
                                <div className="space-y-3 text-left">
                                    <select
                                        value={bestGoalId}
                                        onChange={(e) => setBestGoalId(e.target.value)}
                                        className="w-full p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]/50 transition-all appearance-none"
                                    >
                                        <option value="" disabled>Select a goal...</option>
                                        <option value="none">None / Not listed</option>
                                        {goals.map(g => (
                                            <option key={g.id} value={g.id}>{g.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Question 3: Worst Performance */}
                        {currentStep === 2 && (
                            <div className="space-y-6 text-center max-w-md mx-auto">
                                <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
                                    <AlertTriangle className="w-8 h-8 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold">What do you feel you did worst on?</h2>
                                <div className="space-y-3 text-left">
                                    <select
                                        value={worstGoalId}
                                        onChange={(e) => setWorstGoalId(e.target.value)}
                                        className="w-full p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]/50 transition-all appearance-none"
                                    >
                                        <option value="" disabled>Select a goal...</option>
                                        <option value="none">None / Not listed</option>
                                        {goals.map(g => (
                                            <option key={g.id} value={g.id}>{g.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Question 4: Priority Adjustment */}
                        {currentStep === 3 && (
                            <div className="space-y-6 text-center max-w-md mx-auto">
                                <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-mind)]/10 flex items-center justify-center">
                                    <Zap className="w-8 h-8 text-[var(--color-mind)]" />
                                </div>
                                <h2 className="text-2xl font-bold">Would you like to change the priority order of this goal?</h2>
                                <p className="text-sm text-[var(--text-tertiary)]">
                                    Goal: {goals.find(g => g.id === worstGoalId)?.title || 'Unknown'}
                                </p>
                                <div className="grid gap-3">
                                    {(['increase', 'decrease', 'no'] as const).map(option => (
                                        <button
                                            key={option}
                                            onClick={() => setPriorityChange(option)}
                                            className={`p-4 rounded-xl border text-sm font-bold capitalize transition-all ${
                                                priorityChange === option
                                                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
                                            }`}
                                        >
                                            {option === 'no' ? 'No changes' : `${option} priority`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Question 5: Feedback / Prompt */}
                        {currentStep === 4 && (
                            <div className="space-y-6 text-center max-w-md mx-auto">
                                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                                    <MessageCircle className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h2 className="text-2xl font-bold">What would you like to change about your week?</h2>
                                <div className="space-y-2 text-left">
                                    <textarea
                                        value={feedbackText}
                                        onChange={(e) => setFeedbackText(e.target.value)}
                                        placeholder="Tell the AI Coach how to improve your schedule next week..."
                                        className="w-full h-32 p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]/50 transition-all resize-none"
                                    />
                                    <div className={`text-xs text-right font-medium ${wordCount > 100 ? 'text-red-500' : 'text-[var(--text-tertiary)]'}`}>
                                        {wordCount} / 100 words
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Question 6: Execution */}
                        {currentStep === 5 && (
                            <div className="space-y-6 max-w-lg mx-auto">
                                <div className="text-center space-y-2 mb-8">
                                    <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center mb-4">
                                        <Brain className="w-8 h-8 text-[var(--color-primary)]" />
                                    </div>
                                    <h2 className="text-2xl font-bold">Review Complete</h2>
                                    <p className="text-[var(--text-secondary)] text-sm">How would you like to implement your feedback?</p>
                                </div>

                                <div className="grid gap-4">
                                    <button
                                        onClick={() => handleExecute('auto')}
                                        disabled={isExecuting}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-[var(--color-primary)]/20 to-transparent border border-[var(--color-primary)]/30 hover:brightness-110 transition-all text-left group disabled:opacity-50"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                            {executingMode === 'auto' ? <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin" /> : <Zap className="w-4 h-4 text-[var(--color-primary)]" />} Automatically input feedback
                                        </span>
                                        <span className="text-xs text-[var(--text-secondary)] mt-1.5">
                                            Generates a new schedule for next week using your feedback and auto-adjusts your goals.
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => handleExecute('semi-auto')}
                                        disabled={isExecuting}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all text-left disabled:opacity-50"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                            {executingMode === 'semi-auto' && <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]" />} Semi-automatically input feedback
                                        </span>
                                        <span className="text-xs text-[var(--text-tertiary)] mt-1.5">
                                            Auto-adjusts your goals, then redirects you to the goals page to manually review and change what you deem necessary.
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => handleExecute('manual')}
                                        disabled={isExecuting}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all text-left disabled:opacity-50"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                            {executingMode === 'manual' && <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]" />} Manually make changes
                                        </span>
                                        <span className="text-xs text-[var(--text-tertiary)] mt-1.5">
                                            Redirects to the dashboard leaving you to manually make changes based on your reflection.
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation Footer */}
            {currentStep < 5 && (
                <div className="flex justify-between items-center pt-6 border-t border-[var(--glass-border)] max-w-md mx-auto w-full">
                    <button
                        onClick={handleBack}
                        disabled={currentStep === 0}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] disabled:opacity-30 transition-all flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                        onClick={handleNext}
                        disabled={!isStepValid()}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--color-primary)] hover:brightness-110 disabled:opacity-30 transition-all flex items-center gap-2 shadow-lg shadow-[var(--color-primary)]/20"
                    >
                        Next <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
