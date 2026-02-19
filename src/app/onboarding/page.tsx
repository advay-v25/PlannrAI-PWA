'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { AIInsightTransition } from '@/components/onboarding/ai-insight-transition';

// Step Components
import { Step1Framing } from '@/components/onboarding/step-1-framing';
import { Step2Time } from '@/components/onboarding/step-2-time';
import { Step3Meals } from '@/components/onboarding/step-3-meals';
import { Step4Commitments } from '@/components/onboarding/step-4-commitments';
import { Step5Body } from '@/components/onboarding/step-5-body';
import { Step3Goals } from '@/components/onboarding/step-3-goals';
import { Step7Scan } from '@/components/onboarding/step-7-scan';
import { Step8Generate } from '@/components/onboarding/step-8-generate';

import { ArrowLeft, ArrowRight } from 'lucide-react';

const STEPS = [
    { id: 'framing', title: 'Initialization', component: Step1Framing, aiInsight: false },
    { id: 'time', title: 'Circadian Rhythm', component: Step2Time, aiInsight: true },
    { id: 'meals', title: 'Fuel & Space', component: Step3Meals, aiInsight: true },
    { id: 'commitments', title: 'Anchors', component: Step4Commitments, aiInsight: true },
    { id: 'body', title: 'Body Baseline', component: Step5Body, aiInsight: true },
    { id: 'goals', title: 'Time Investment', component: Step3Goals, aiInsight: true },
    { id: 'scan', title: 'Bio-Calibration', component: Step7Scan, aiInsight: false },
    { id: 'generate', title: 'Day Synthesis', component: Step8Generate, aiInsight: false },
];

// Extract step-specific data for the AI insight context
function getStepData(stepId: string, data: any): Record<string, any> {
    switch (stepId) {
        case 'time':
            return {
                sleep_start: data.sleep_start,
                sleep_end: data.sleep_end,
                wind_down_mins: data.wind_down_mins,
                wake_hour: parseInt(data.sleep_end?.split(':')[0] || '7'),
            };
        case 'meals':
            return {
                meals_per_day: data.meals_per_day,
                meal_windows: data.meal_windows,
                buffer_config: data.buffer_config,
            };
        case 'commitments':
            return {
                commitments: data.commitments?.map((c: any) => ({ title: c.title, days: c.days_of_week?.length })),
                total_commitments: data.commitments?.length || 0,
            };
        case 'body':
            return {
                activity_types: data.body_preferences?.activity_types,
                preferred_time: data.body_preferences?.preferred_time,
                duration_mins: data.body_preferences?.duration_mins,
            };
        case 'goals':
            return {
                goals: data.goals?.map((g: any) => ({ title: g.title, category: g.category, minutes: g.minutes_per_day })),
                total_goal_minutes: data.goals?.reduce((s: number, g: any) => s + (g.minutes_per_day || 0), 0),
                goal_count: data.goals?.length || 0,
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
                body: JSON.stringify({
                    timezone: data.timezone,
                    sleep_start: data.sleep_start || '22:00',
                    sleep_end: data.sleep_end || '07:00',
                    goals: data.goals,
                    energy_level: data.energy_level,
                    stress_level: data.stress_level,
                    meals_per_day: data.meals_per_day,
                    meal_windows: data.meal_windows,
                    body_preferences: data.body_preferences,
                    buffer_config: data.buffer_config,
                    wind_down_mins: data.wind_down_mins,
                    full_name: data.full_name,
                    commitments: data.commitments,
                    ai_can_suggest: data.ai_can_suggest,
                    ai_can_analyze: data.ai_can_analyze,
                    ai_can_draft: data.ai_can_draft,
                    ai_profile: data.ai_profile
                })
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

    // Handle AI insight completion — merge into profile and advance
    const handleInsightComplete = useCallback((insight: any) => {
        setShowInsight(false);

        const currentProfile = data.ai_profile || {
            chronotype: null,
            productivity_archetype: null,
            energy_pattern: null,
            risk_factors: [],
            donna_notes: [],
            step_insights: {},
        };

        const updatedProfile = {
            ...currentProfile,
            ...(insight.profile_update?.chronotype && { chronotype: insight.profile_update.chronotype }),
            ...(insight.profile_update?.productivity_archetype && { productivity_archetype: insight.profile_update.productivity_archetype }),
            ...(insight.profile_update?.energy_pattern && { energy_pattern: insight.profile_update.energy_pattern }),
            risk_factors: [
                ...currentProfile.risk_factors,
                ...(insight.profile_update?.risk_flag ? [insight.profile_update.risk_flag] : [])
            ],
            donna_notes: [
                ...currentProfile.donna_notes,
                insight.donna_note
            ],
            step_insights: {
                ...currentProfile.step_insights,
                [STEPS[currentStep].id]: insight.insight
            }
        };

        updateData({ ai_profile: updatedProfile });
        nextStep();
    }, [data.ai_profile, currentStep, updateData, nextStep]);

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
                            energy_level: data.energy_level,
                            stress_level: data.stress_level,
                            goals_count: data.goals?.length || 0,
                            total_goal_minutes: data.goals?.reduce((s: number, g: any) => s + (g.minutes_per_day || 0), 0),
                            commitments_count: data.commitments?.length || 0,
                            existing_profile: data.ai_profile,
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
