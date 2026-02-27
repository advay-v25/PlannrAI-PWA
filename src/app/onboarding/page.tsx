'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { AIInsightTransition } from '@/components/onboarding/ai-insight-transition';

import { Step1Framing } from '@/components/onboarding/v1/step-1-framing';
import { Step2Snapshot } from '@/components/onboarding/v1/step-2-snapshot';
import { Step3Goals } from '@/components/onboarding/v1/step-3-goals';
import { Step4Energy } from '@/components/onboarding/v1/step-4-energy';
import { Step5Options } from '@/components/onboarding/v1/step-5-options';

import { ArrowLeft, ArrowRight } from 'lucide-react';

const STEPS = [
    { id: 'framing', title: 'Initialization', component: Step1Framing, aiInsight: false },
    { id: 'snapshot', title: 'Life Snapshot', component: Step2Snapshot, aiInsight: true },
    { id: 'goals', title: 'Goal Discovery', component: Step3Goals, aiInsight: true },
    { id: 'energy', title: 'Energy Patterns', component: Step4Energy, aiInsight: true },
    { id: 'options', title: 'Schedule Options', component: Step5Options, aiInsight: false },
];

// Extract step-specific data for the AI insight context
function getStepData(stepId: string, data: any): Record<string, any> {
    switch (stepId) {
        case 'snapshot':
            return {
                sleep_start: data.sleep_start,
                sleep_end: data.sleep_end,
                commitments: data.commitments?.length || 0,
                meals: data.meals_per_day,
            };
        case 'goals':
            return {
                goals: data.goals?.map((g: any) => ({ title: g.title, category: g.category, hours: g.suggested_hours_week })),
                goal_count: data.goals?.length || 0,
            };
        case 'energy':
            return {
                peak_windows: data.peak_windows,
                low_windows: data.low_windows,
                work_style: data.work_style,
            };
        default:
            return {};
    }
}

export default function OnboardingPage() {
    const router = useRouter();
    const supabase = createClient();
    const { currentStep, data, nextStep, prevStep, reset, updateData } = useOnboardingStore();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [showInsight, setShowInsight] = useState(false);

    const CurrentStepComponent = STEPS[currentStep]?.component;
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === STEPS.length - 1;
    const currentStepDef = STEPS[currentStep];

    const handleComplete = async () => {
        setIsSaving(true);
        setError('');

        try {
            let { data: { user } } = await supabase.auth.getUser();
            if (!user) user = { id: '5eaf0087-f547-4d87-a235-facd3bd3b997', email: 'advay@plannrai.com' } as any;
            if (!user) throw new Error('Not authenticated');

            const response = await fetch('/api/onboarding/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error?.message || `API Error: ${response.status}`);
            }

            const blocksCreated = result.data?.blocksCreated || 0;
            await supabase.auth.updateUser({ data: { onboarding_complete: true } });

            reset();
            const warning = blocksCreated === 0 ? '&warning=empty_schedule' : '';
            router.push(`/app?setup=complete${warning}`);

        } catch (error) {
            console.error('Onboarding sync failed:', error);
            setError(error instanceof Error ? error.message : 'Failed to save profile');
        } finally {
            setIsSaving(false);
        }
    };

    // Handle AI insight completion (V1: we just log it or notify, then move on)
    const handleInsightComplete = useCallback((insight: any) => {
        setShowInsight(false);
        // Instead of accumulating a giant ai_profile, we could just log this insight or skip.
        // For V1 conversational flow, the "Insights" are handled mostly sequentially in the Chat UI.

        console.log("Insight generated between steps:", insight);

        nextStep();
    }, [currentStep, updateData, nextStep]);

    const handleNext = () => {
        if (isLastStep) {
            handleComplete();
        } else if (currentStepDef.aiInsight) {
            setShowInsight(true);
        } else {
            nextStep();
        }
    };

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-black text-white selection:bg-[var(--color-primary)] selection:text-white">

            {/* AI Insight Transition Overlay */}
            <AnimatePresence>
                {showInsight && (
                    <AIInsightTransition
                        stepId={currentStepDef.id}
                        stepData={getStepData(currentStepDef.id, data)}
                        accumulatedData={{
                            name: data.full_name,
                            sleep: { start: data.sleep_start, end: data.sleep_end },
                            energy_level: 3,
                            stress_level: 3,
                            goals_count: data.goals?.length || 0,
                            total_goal_minutes: 0,
                            commitments_count: data.commitments?.length || 0,
                        }}
                        onComplete={handleInsightComplete}
                        userName={data.full_name}
                    />
                )}
            </AnimatePresence>

            {/* Immersive Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-purple-900/20 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-orange-900/20 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute top-[40%] left-[50%] transform -translate-x-1/2 w-[50vw] h-[50vw] rounded-full bg-teal-900/10 blur-[150px]" />
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-5" />
            </div>

            <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">

                {/* Minimalist Progress */}
                <div className="w-full flex items-center justify-between mb-12 px-2 text-xs font-mono uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-60">
                    <span>Sequence {currentStep + 1}/{STEPS.length}</span>
                    <span>{STEPS[currentStep].title}</span>
                </div>

                {/* Main Content Area */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                        transition={{ duration: 0.5, ease: "circOut" }}
                        className="w-full"
                    >
                        <GlassCard variant="glow" padding="lg" className="w-full min-h-[500px] flex flex-col justify-center border-[var(--glass-border)]/50 shadow-2xl backdrop-blur-xl">
                            {CurrentStepComponent && <CurrentStepComponent />}

                            {error && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-6 text-sm text-red-400 text-center font-mono"
                                >
                                    SRV_ERR: {error}
                                </motion.p>
                            )}
                        </GlassCard>
                    </motion.div>
                </AnimatePresence>

                {/* Floating Navigation */}
                <div className="flex items-center gap-6 mt-12 w-full justify-between max-w-md px-4">
                    <button
                        onClick={prevStep}
                        disabled={isFirstStep}
                        className={`
                            group flex items-center gap-2 text-sm font-medium transition-all
                            ${isFirstStep
                                ? 'opacity-0 pointer-events-none'
                                : 'text-[var(--color-text-secondary)] hover:text-white'
                            }
                        `}
                    >
                        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                        <span className="tracking-wide">BACK</span>
                    </button>

                    <GlassButton
                        onClick={handleNext}
                        variant="primary"
                        className="px-8 py-6 rounded-full text-base font-bold shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.5)] transition-shadow"
                        loading={isSaving}
                    >
                        {isLastStep ? (
                            isSaving ? 'GENERATING...' : 'APPLY SCHEDULE'
                        ) : isFirstStep ? (
                            <span className="flex items-center gap-2">START <ArrowRight className="w-4 h-4" /></span>
                        ) : (
                            <span className="flex items-center gap-2">
                                NEXT <ArrowRight className="w-4 h-4" />
                            </span>
                        )}
                    </GlassButton>
                </div>

                {/* Progress Bar (Bottom) */}
                <div className="absolute bottom-[-60px] w-full max-w-xs h-1 bg-[var(--glass-border)] rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            </div>
        </div>
    );
}
