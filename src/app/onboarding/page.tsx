'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

// New Step Components
import { Step1Identity } from '@/components/onboarding/steps/step-1-identity';
import { Step2Rhythm } from '@/components/onboarding/steps/step-2-rhythm';
import { Step3Anchors } from '@/components/onboarding/steps/step-3-anchors';
import { Step4Goals } from '@/components/onboarding/steps/step-4-goals';
import { Step5FailureModes } from '@/components/onboarding/steps/step-5-failure-modes';
import { Step6Generate } from '@/components/onboarding/steps/step-6-generate';

const STEPS = [
    { id: 'identity', title: 'Identity', component: Step1Identity },
    { id: 'rhythm', title: 'Daily Rhythm', component: Step2Rhythm },
    { id: 'anchors', title: 'Anchors', component: Step3Anchors },
    { id: 'goals', title: 'Goals', component: Step4Goals },
    { id: 'failure_modes', title: 'Protective Layers', component: Step5FailureModes },
    { id: 'generate', title: 'Initialization', component: Step6Generate },
];

export default function OnboardingPage() {
    const router = useRouter();
    const supabase = createClient();
    const { currentStep, data, nextStep, prevStep, reset } = useOnboardingStore();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const CurrentStepComponent = STEPS[currentStep]?.component;
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === STEPS.length - 1;
    const currentStepDef = STEPS[currentStep];

    const handleComplete = async () => {
        setIsSaving(true);
        setError('');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const response = await fetch('/api/onboarding/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || `API Error: ${response.status}`);
            }

            // Mark session as complete client-side too
            await supabase.auth.updateUser({ data: { onboarding_complete: true } });

            reset();
            router.push('/app?setup=complete');

        } catch (err: any) {
            console.error('Onboarding finalization failed:', err);
            setError(err.message || 'Failed to initialize account');
        } finally {
            setIsSaving(false);
        }
    };

    const validateStep = () => {
        if (currentStepDef.id === 'identity' && !data.full_name) return false;
        if (currentStepDef.id === 'goals' && data.goals.length === 0) return false;
        // Other steps are optional or have defaults
        return true;
    };

    const handleNext = () => {
        if (!validateStep()) {
            setError('PLEASE COMPLETE THIS SEQUENCE BEFORE PROCEEDING.');
            setTimeout(() => setError(''), 3000);
            return;
        }

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
                <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-purple-900/20 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-orange-900/20 blur-[100px]" />
                <div className="absolute top-[40%] left-[50%] transform -translate-x-1/2 w-[50vw] h-[50vw] rounded-full bg-teal-900/10 blur-[150px]" />
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-5" />
            </div>

            <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">

                {/* Minimalist Progress Header */}
                <div className="w-full flex items-center justify-between mb-8 px-2 text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-60">
                    <span className="flex items-center gap-2">
                        <span className="text-[var(--color-primary)]">CORE_SEQ</span> {currentStep + 1}/{STEPS.length}
                    </span>
                    <span className="flex gap-1">
                        {STEPS.map((_, i) => (
                            <div key={i} className={`w-3 h-0.5 rounded-full ${i <= currentStep ? 'bg-[var(--color-primary)]' : 'bg-white/10'}`} />
                        ))}
                    </span>
                    <span>{currentStepDef.title}</span>
                </div>

                {/* Main Content Area */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 1.02, y: -10 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="w-full"
                    >
                        <GlassCard variant="glow" padding="lg" className="w-full min-h-[500px] flex flex-col justify-start border-[var(--glass-border)]/30 backdrop-blur-3xl">
                            {CurrentStepComponent && <CurrentStepComponent />}

                            {error && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-6 text-xs text-red-500 text-center font-mono uppercase tracking-tighter"
                                >
                                    SYSTEM_ALERT: {error}
                                </motion.p>
                            )}
                        </GlassCard>
                    </motion.div>
                </AnimatePresence>

                {/* Floating Navigation */}
                <div className="flex items-center gap-6 mt-8 w-full justify-between max-w-md px-4">
                    <button
                        onClick={prevStep}
                        disabled={isFirstStep || isSaving}
                        className={`
                            group flex items-center gap-2 text-xs font-bold transition-all font-mono tracking-widest
                            ${(isFirstStep || isSaving)
                                ? 'opacity-0 pointer-events-none'
                                : 'text-[var(--color-text-secondary)] hover:text-white'
                            }
                        `}
                    >
                        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                        <span>PREV_STEP</span>
                    </button>

                    <GlassButton
                        onClick={handleNext}
                        variant="primary"
                        disabled={isSaving}
                        className="px-10 py-6 rounded-2xl text-base font-black font-mono shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)] hover:scale-105 active:scale-95 transition-all"
                    >
                        {isSaving ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>INITIALIZING...</span>
                            </div>
                        ) : isLastStep ? (
                            <span>ACTIVATE OS</span>
                        ) : (
                            <span className="flex items-center gap-2 tracking-tighter">
                                NEXT_SEQUENCE <ArrowRight className="w-4 h-4" />
                            </span>
                        )}
                    </GlassButton>
                </div>
            </div>
        </div>
    );
}

