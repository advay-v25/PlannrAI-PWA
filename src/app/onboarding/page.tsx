'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';

// Step Components
import { Step1Framing } from '@/components/onboarding/step-1-framing';
import { Step2Time } from '@/components/onboarding/step-2-time';
import { Step3Goals } from '@/components/onboarding/step-3-goals';
import { Step4Baseline } from '@/components/onboarding/step-4-baseline';
import { Step5Permissions } from '@/components/onboarding/step-5-permissions';
import { Step6Complete } from '@/components/onboarding/step-6-complete';

import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

const STEPS = [
    { id: 'framing', title: 'Initialization', component: Step1Framing },
    { id: 'time', title: 'Circadian Rhythm', component: Step2Time },
    { id: 'goals', title: 'Ambitions', component: Step3Goals },
    { id: 'baseline', title: 'System Calibration', component: Step4Baseline },
    { id: 'permissions', title: 'Neural Link', component: Step5Permissions },
    { id: 'complete', title: 'Launch Sequence', component: Step6Complete },
];

export default function OnboardingPage() {
    const router = useRouter();
    const supabase = createClient();
    const { currentStep, data, setStep, nextStep, prevStep, reset } = useOnboardingStore();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const CurrentStepComponent = STEPS[currentStep]?.component;
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === STEPS.length - 1;
    const isGoalsStep = currentStep === 2;

    const totalMinutes = data.goals.reduce((sum, g) => sum + g.minutes_per_day, 0);
    // Simple check, real capacity logic is clearer in Step 2/3 themselves

    const handleComplete = async () => {
        setIsSaving(true);
        setError('');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // 1. Update profile
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    full_name: data.full_name,
                    preferred_name: data.full_name?.split(' ')[0] || data.full_name, // First name for greeting
                    timezone: data.timezone,
                    sleep_start: data.sleep_start,
                    sleep_end: data.sleep_end,
                    energy_level: data.energy_level,
                    stress_level: data.stress_level,
                    ai_can_suggest: data.ai_can_suggest,
                    ai_can_analyze: data.ai_can_analyze,
                    ai_can_draft: data.ai_can_draft,
                    onboarding_complete: true,
                    updated_at: new Date().toISOString(),
                });

            if (profileError) throw profileError;

            // 1.5 Update Auth Metadata (Name)
            const { error: authError } = await supabase.auth.updateUser({
                data: { full_name: data.full_name }
            });

            if (authError) throw authError;

            if (profileError) throw profileError;

            // 2. Insert goals
            if (data.goals.length > 0) {
                const goalsToInsert = data.goals.map((goal) => ({
                    user_id: user.id,
                    title: goal.title,
                    category: goal.category,
                    minutes_per_day: goal.minutes_per_day,
                    importance: goal.importance,
                }));

                const { error: goalsError } = await supabase
                    .from('goals')
                    .insert(goalsToInsert);

                if (goalsError) throw goalsError;
            }

            // 3. Insert commitments
            if (data.commitments.length > 0) {
                const commitmentsToInsert = data.commitments.map((c) => ({
                    user_id: user.id,
                    title: c.title,
                    day_of_week: c.day_of_week,
                    start_time: c.start_time,
                    end_time: c.end_time,
                }));

                const { error: commitmentsError } = await supabase
                    .from('commitments')
                    .insert(commitmentsToInsert);

                if (commitmentsError) throw commitmentsError;
            }

            // 4. Generate AI Plan
            try {
                await fetch('/api/ai/plan-week', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ week_start: new Date().toISOString() })
                });
            } catch (aiError) {
                console.error('Initial AI planning failed:', aiError);
            }

            reset();
            router.push('/app');
        } catch (err: any) {
            setError(err.message || 'Failed to save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleNext = () => {
        if (isLastStep) {
            handleComplete();
        } else {
            nextStep();
        }
    };

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-black text-white selection:bg-[var(--color-primary)] selection:text-white">

            {/* Immersive Background */}
            <div className="absolute inset-0 z-0">
                {/* Animated Mesh Gradient */}
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

                            {/* In-content Error */}
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
                            isSaving ? 'INITIALIZING...' : 'BEGIN JOURNEY'
                        ) : (
                            <span className="flex items-center gap-2">
                                PROCEED <ArrowRight className="w-4 h-4" />
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
