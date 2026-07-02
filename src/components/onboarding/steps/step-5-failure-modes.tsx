'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore, FailureMode } from '@/stores';
import { Info } from 'lucide-react';

const FAILURE_MODES: { id: FailureMode; label: string; description: string }[] = [
    { id: 'unexpected_meetings', label: 'Unexpected meetings or calls', description: 'Your calendar fills up with last-minute requests.' },
    { id: 'low_afternoon_energy', label: 'Low energy in afternoons', description: 'The 3 PM slump is real for you.' },
    { id: 'social_commitments', label: 'Social commitments pop up', description: 'You find it hard to say no to evening invites.' },
    { id: 'procrastination', label: 'Difficulty starting hard tasks', description: 'You avoid the "Big Frog" until too late.' },
    { id: 'overcommitting', label: 'Overcommitting and burning out', description: 'You say yes to everything and pay the price.' },
    { id: 'no_buffer_time', label: 'Back-to-back scheduling', description: 'Transitioning between tasks feels rushed.' },
    { id: 'distractions', label: 'Easy to distract', description: 'Phone notifications and emails derail your focus.' },
    { id: 'underestimating_time', label: 'Underestimating task duration', description: 'Things always take longer than you think.' },
    { id: 'sleep_deprivation', label: 'Sleep deprivation', description: 'Poor sleep makes the next day a struggle.' },
    { id: 'none', label: "None of these - I'm consistent", description: "You've got your systems locked in already." }
];

export function Step5FailureModes() {
    const { data, updateData } = useOnboardingStore();
    const modes = data.failure_modes || [];

    const toggleFailureMode = (id: FailureMode) => {
        if (id === 'none') {
            updateData({ failure_modes: ['none'] });
            return;
        }

        const current = modes.filter(m => m !== 'none');
        if (current.includes(id)) {
            updateData({ failure_modes: current.filter(m => m !== id) });
        } else {
            updateData({ failure_modes: [...current, id] });
        }
    };

    return (
        <div className="flex flex-col items-center justify-start space-y-8 w-full max-w-lg mx-auto pb-10">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 text-center"
            >
                <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
                    Protective <span className="text-[var(--color-primary)]">Layers</span>
                </h2>
                <p className="text-[var(--color-text-secondary)] text-sm tracking-wide">
                    What usually derails your ideal schedule?
                </p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="w-full grid grid-cols-1 gap-4"
            >
                {FAILURE_MODES.map((mode) => {
                    const isSelected = modes.includes(mode.id);
                    return (
                        <button
                            key={mode.id}
                            onClick={() => toggleFailureMode(mode.id)}
                            className={`flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300 text-left group backdrop-blur-md shadow-lg ${
                                isSelected
                                    ? 'bg-[var(--glass-bg)] border-[var(--glass-border)] shadow-[0_0_30px_rgba(255,255,255,0.05)] scale-[1.02]'
                                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] hover:border-[var(--glass-border)] hover:bg-white/[0.07] hover:scale-[1.01]'
                            }`}
                        >
                            <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300 shadow-inner ${
                                isSelected 
                                    ? 'bg-white border-white scale-110' 
                                    : 'border-[var(--glass-border)] group-hover:border-[var(--color-primary)]'
                            }`}>
                                {isSelected && <div className="w-2.5 h-2.5 bg-black rounded-sm shadow-sm" />}
                            </div>
                            <div>
                                <div className={`font-semibold tracking-wide transition-colors duration-300 ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--text-primary)]'}`}>
                                    {mode.label}
                                </div>
                                <div className="text-xs text-[var(--text-primary)]/50 mt-1.5 font-medium leading-relaxed">
                                    {mode.description}
                                </div>
                            </div>
                        </button>
                    );
                })}

                <div className="mt-8 p-5 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex gap-4 items-start backdrop-blur-md shadow-lg">
                    <Info className="w-5 h-5 text-[var(--color-primary)] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[var(--text-primary)]/70 leading-relaxed font-mono tracking-wide uppercase">
                        We use these points of failure to inject protective buffers and build adaptive flexibility directly into your generated week.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
