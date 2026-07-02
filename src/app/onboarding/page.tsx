'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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
    const { currentStep, data, nextStep, prevStep, reset, updateData } = useOnboardingStore();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [showMealSelectionPopup, setShowMealSelectionPopup] = useState(false);
    const [popupSelectedMeals, setPopupSelectedMeals] = useState<('breakfast' | 'lunch' | 'dinner')[]>([]);

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

            await apiClient.post<unknown>('/api/onboarding/complete', data);

            // Mark session as complete client-side too
            await supabase.auth.updateUser({ data: { onboarding_complete: true } });

            // Generate initial schedule if not skipped
            if (data.selected_variant_id !== 'skip') {
                try {
                    await apiClient.post<unknown>('/api/onboarding/generate-initial', { selected_variant_id: data.selected_variant_id });
                } catch (genErr) {
                    console.error('Initial schedule generation failed, but onboarding is complete', genErr);
                    // We don't throw here, let them go to the calendar and retry generating later if needed
                }
            }
            router.push('/app/calendar?setup=complete');
            setTimeout(() => reset(), 2000);

        } catch (err: unknown) {
            console.error('Onboarding finalization failed:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to initialize account';
            setError(errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    const validateStep = () => {
        if (currentStepDef.id === 'identity' && !data.full_name) return false;
        if (currentStepDef.id === 'rhythm' && data.meals_per_day === 2 && !data.two_meals_selection) return false;
        if (currentStepDef.id === 'goals' && (!data.goals || data.goals.length === 0)) return false;
        // Other steps are optional or have defaults
        return true;
    };

    const handleNext = () => {
        if (currentStepDef.id === 'rhythm' && data.meals_per_day === 2 && !data.two_meals_selection) {
            setShowMealSelectionPopup(true);
            return;
        }

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
        <div className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-[#020106] text-white font-sans selection:bg-purple-500/30 selection:text-white">
            
            {/* Premium Subtle Ambient Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(15,10,35,0.8)_0%,rgba(2,1,6,1)_100%)] pointer-events-none" />
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-fuchsia-900/10 rounded-full blur-[150px] pointer-events-none" />

            <div className="relative z-10 w-full max-w-3xl flex flex-col items-center min-h-[700px] py-10">

                {/* Premium Minimalist Progress Header */}
                <div className={`w-full flex justify-center px-2 ${(currentStepDef.id === 'identity' || currentStepDef.id === 'rhythm') ? 'mb-6' : 'mb-16'}`}>
                    <div className="flex flex-col items-center w-full max-w-md">
                        <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-purple-400/80 mb-4">
                            Step {currentStep + 1} of {STEPS.length}
                        </span>
                        
                        <div className="flex gap-3 w-full mb-6">
                            {STEPS.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`h-1 rounded-full transition-all duration-700 ease-in-out flex-1 ${
                                        i === currentStep 
                                            ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' 
                                            : i < currentStep 
                                                ? 'bg-purple-500/30' 
                                                : 'bg-white/5'
                                    }`} 
                                />
                            ))}
                        </div>

                        {currentStepDef.id !== 'identity' && currentStepDef.id !== 'rhythm' && (
                            <h2 className="text-2xl md:text-3xl font-light tracking-tight text-white/90">
                                {currentStepDef.title}
                            </h2>
                        )}
                    </div>
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
                            group flex items-center gap-2 text-xs font-medium transition-all duration-300 tracking-wide px-4 py-3 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5
                            ${(isFirstStep || isSaving)
                                ? 'opacity-0 pointer-events-none'
                                : 'text-white/40 hover:text-white'
                            }
                        `}
                    >
                        <ArrowLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1 border-[1.5px] rounded-full p-0.5" />
                        <span className="text-xs font-medium tracking-wide">Previous</span>
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={isSaving}
                        className="group relative px-7 py-3 md:py-3.5 rounded-full text-base font-bold tracking-wide text-black bg-white hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] disabled:opacity-50 disabled:pointer-events-none overflow-hidden"
                    >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 block w-full h-full transform -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                        
                        {isSaving ? (
                            <div className="flex items-center justify-center gap-2 relative z-10 w-[110px]">
                                <Loader2 className="w-4.5 h-4.5 animate-spin" />
                                <span className="text-base font-bold">Setting up...</span>
                            </div>
                        ) : isLastStep ? (
                            <span className="relative z-10 px-3 text-base font-bold">Go to Dashboard</span>
                        ) : (
                            <span className="flex items-center justify-center gap-2 relative z-10 w-[90px]">
                                <span className="font-bold tracking-wide text-base">Next</span>
                                <div className="bg-black/10 rounded-full p-1 transition-transform duration-300 group-hover:translate-x-1">
                                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                                </div>
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {showMealSelectionPopup && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-6 max-w-sm w-full mx-4 space-y-5 rounded-3xl shadow-2xl text-center backdrop-blur-xl"
                        >
                            <div className="space-y-2">
                                <h3 className="text-lg font-bold text-white font-mono uppercase tracking-wide">
                                    Select Your 2 Meals
                                </h3>
                                <p className="text-xs text-[var(--text-primary)]/70 leading-relaxed">
                                    Please select the two meals you would like to schedule before proceeding.
                                </p>
                            </div>

                            <div className="flex gap-2.5">
                                {[
                                    { id: 'breakfast', label: 'Breakfast' },
                                    { id: 'lunch', label: 'Lunch' },
                                    { id: 'dinner', label: 'Dinner' }
                                ].map((opt) => {
                                    const isSelected = popupSelectedMeals.includes(opt.id as 'breakfast' | 'lunch' | 'dinner');
                                    return (
                                        <button
                                            type="button"
                                            key={opt.id}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setPopupSelectedMeals(prev => prev.filter(m => m !== opt.id));
                                                } else {
                                                    if (popupSelectedMeals.length < 2) {
                                                        setPopupSelectedMeals(prev => [...prev, opt.id as 'breakfast' | 'lunch' | 'dinner']);
                                                    } else {
                                                        setPopupSelectedMeals(prev => [prev[0], opt.id as 'breakfast' | 'lunch' | 'dinner']);
                                                    }
                                                }
                                            }}
                                            className={`py-3 rounded-2xl text-xs font-bold transition-all duration-300 flex-1 border tracking-wide ${
                                                isSelected
                                                    ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent'
                                                    : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowMealSelectionPopup(false);
                                        setPopupSelectedMeals([]);
                                    }}
                                    className="flex-1 py-2.5 rounded-xl border border-[var(--glass-border)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--glass-bg-active)] transition-colors duration-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={popupSelectedMeals.length !== 2}
                                    onClick={() => {
                                        const sorted = [...popupSelectedMeals].sort();
                                        let val: 'breakfast_lunch' | 'lunch_dinner' | 'breakfast_dinner' = 'lunch_dinner';
                                        if (sorted[0] === 'breakfast' && sorted[1] === 'lunch') val = 'breakfast_lunch';
                                        else if (sorted[0] === 'lunch' && sorted[1] === 'dinner') val = 'lunch_dinner';
                                        else if (sorted[0] === 'breakfast' && sorted[1] === 'dinner') val = 'breakfast_dinner';

                                        updateData({ two_meals_selection: val });
                                        setShowMealSelectionPopup(false);
                                        setPopupSelectedMeals([]);
                                        nextStep();
                                    }}
                                    className="flex-1 py-2.5 rounded-xl bg-[var(--color-primary)] hover:shadow-[0_0_15px_rgba(251,146,60,0.4)] text-xs font-bold text-white transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    Confirm & Next
                                </button>
                            </div>
                            <div className="flex justify-center pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        updateData({ two_meals_selection: null });
                                        setShowMealSelectionPopup(false);
                                        setPopupSelectedMeals([]);
                                        nextStep();
                                    }}
                                    className="text-xs text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/80 transition-colors duration-300 font-medium tracking-wide underline"
                                >
                                    Select Later
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

