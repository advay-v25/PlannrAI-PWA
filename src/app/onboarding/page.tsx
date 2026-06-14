'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

// New Step Components
import { Step1Identity } from '@/components/onboarding/steps/step-1-identity';
import { Step2Rhythm } from '@/components/onboarding/steps/step-2-rhythm';
import { Step3Anchors } from '@/components/onboarding/steps/step-3-anchors';
import { Step4Goals } from '@/components/onboarding/steps/step-4-goals';
import { Step5FailureModes } from '@/components/onboarding/steps/step-5-failure-modes';
import { Step6Generate } from '@/components/onboarding/steps/step-6-generate';
import { DynamicBackground } from '@/components/ui/DynamicBackground';

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
            // result is an ApiEnvelope: { ok: true, data: {...}, error?: {...} }
            if (!response.ok || !result.ok) {
                const errorMsg = result.error?.message || result.error || `API Error: ${response.status}`;
                throw new Error(errorMsg);
            }

            // Mark session as complete client-side too
            await supabase.auth.updateUser({ data: { onboarding_complete: true } });

            router.push('/app/calendar?setup=complete');
            setTimeout(() => reset(), 2000);

        } catch (err: any) {
            console.error('Onboarding finalization failed:', err);
            setError(err.message || 'Failed to initialize account');
        } finally {
            setIsSaving(false);
        }
    };

    const validateStep = () => {
        if (currentStepDef.id === 'identity' && !data.full_name) return false;
        if (currentStepDef.id === 'goals' && (!data.goals || data.goals.length === 0)) return false;
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
        <div className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/40 via-neutral-950 to-neutral-950 text-white selection:bg-white/30 selection:text-white font-[family-name:var(--font-geist-sans)]">
            
            {/* Dynamic Ambient Background */}
            <DynamicBackground variant="onboarding" />

            <div className="relative z-10 w-full max-w-3xl flex flex-col items-center min-h-[700px] py-10">

                {/* Minimalist Progress Header */}
                <div className="w-full flex justify-center mb-12 px-2">
                    <div className="flex items-center justify-between w-full max-w-md bg-[var(--glass-bg)] border border-[var(--glass-border)] px-6 py-3.5 rounded-full backdrop-blur-xl shadow-2xl">
                        <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-[var(--text-tertiary)] w-16 text-left">
                            <span className="text-[var(--text-primary)]">S_{currentStep + 1}</span>/{STEPS.length}
                        </span>
                        
                        <div className="flex gap-2">
                            {STEPS.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`h-1.5 rounded-full transition-all duration-700 ease-in-out ${
                                        i === currentStep 
                                            ? 'w-8 bg-[var(--color-primary)] shadow-[0_0_12px_var(--color-primary-glow)]' 
                                            : i < currentStep 
                                                ? 'w-4 bg-[var(--color-primary)]/40' 
                                                : 'w-2 bg-[var(--text-muted)]/20'
                                    }`} 
                                />
                            ))}
                        </div>

                        <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-[var(--text-tertiary)] w-16 text-right truncate">
                            {currentStepDef.title}
                        </span>
                    </div>
                </div>

                <div className="absolute top-6 right-6 px-3 py-1.5 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-full flex items-center gap-2 backdrop-blur-md z-20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--text-secondary)]">Basic Plan</span>
                </div>

                {/* Main Content Area */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, scale: 0.96, y: 15, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 1.04, y: -15, filter: 'blur(10px)' }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full flex-grow flex flex-col items-center"
                    >
                        <div className="w-full filter drop-shadow-2xl flex-grow flex flex-col justify-center">
                            {CurrentStepComponent && <CurrentStepComponent />}

                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        className="mt-8 mx-auto self-center bg-red-500/10 border border-red-500/30 px-6 py-3 rounded-2xl backdrop-blur-md shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                                    >
                                        <p className="text-[10px] text-red-400 text-center font-bold tracking-widest font-mono uppercase">
                                            {error}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Floating Navigation */}
                <div className="flex items-center gap-6 mt-16 w-full justify-between max-w-lg px-6 fixed bottom-8 lg:relative border-t border-white/5 pt-8 backdrop-blur-md lg:backdrop-blur-none lg:border-t-0 lg:pt-0 pb-6 lg:pb-0 z-50">
                    <button
                        onClick={prevStep}
                        disabled={isFirstStep || isSaving}
                        className={`
                            group flex items-center gap-2 text-[10px] uppercase font-bold transition-all duration-300 font-mono tracking-widest px-4 py-3 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5
                            ${(isFirstStep || isSaving)
                                ? 'opacity-0 pointer-events-none'
                                : 'text-white/40 hover:text-white'
                            }
                        `}
                    >
                        <ArrowLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1 border-[1.5px] rounded-full p-0.5" />
                        <span>PREV</span>
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={isSaving}
                        className="group relative px-10 py-4 md:py-5 rounded-full text-sm font-black tracking-widest uppercase text-black bg-white hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] disabled:opacity-50 disabled:pointer-events-none overflow-hidden"
                    >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 block w-full h-full transform -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                        
                        {isSaving ? (
                            <div className="flex items-center justify-center gap-3 relative z-10 w-[140px]">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="font-mono text-[10px] sm:text-xs">INITIALIZING OS...</span>
                            </div>
                        ) : isLastStep ? (
                            <span className="relative z-10 px-4">ACTIVATE OS</span>
                        ) : (
                            <span className="flex items-center justify-center gap-3 relative z-10 w-[140px]">
                                <span>NEXT</span>
                                <div className="bg-black/10 rounded-full p-1 transition-transform duration-300 group-hover:translate-x-1">
                                    <ArrowRight className="w-4 h-4 ml-0.5" />
                                </div>
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

