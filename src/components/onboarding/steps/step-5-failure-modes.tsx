'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore, FailureMode } from '@/stores';
import { AlertTriangle, Info } from 'lucide-react';

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

    const toggleFailureMode = (id: FailureMode) => {
        if (id === 'none') {
            updateData({ failure_modes: ['none'] });
            return;
        }

        const current = data.failure_modes.filter(m => m !== 'none');
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
                className="space-y-2 text-center"
            >
                <h2 className="text-3xl font-bold tracking-tight text-white font-mono uppercase">
                    PROTECTIVE <span className="text-[var(--color-primary)]">LAYERS</span>
                </h2>
                <p className="text-[var(--color-text-secondary)]">
                    What usually derails your schedule?
                </p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="w-full grid grid-cols-1 gap-3"
            >
                {FAILURE_MODES.map((mode) => {
                    const isSelected = data.failure_modes.includes(mode.id);
                    return (
                        <button
                            key={mode.id}
                            onClick={() => toggleFailureMode(mode.id)}
                            className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left group ${
                                isSelected
                                    ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50 ring-1 ring-[var(--color-primary)]/20'
                                    : 'bg-[var(--glass-surface)] border-[var(--glass-border)] hover:border-[var(--color-primary)]/30 hover:bg-[var(--bg-card-hover)]'
                            }`}
                        >
                            <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                isSelected 
                                    ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' 
                                    : 'border-gray-600 group-hover:border-[var(--color-primary)]'
                            }`}>
                                {isSelected && <div className="w-2.5 h-2.5 bg-black rounded-sm" />}
                            </div>
                            <div>
                                <div className={`font-bold transition-colors ${isSelected ? 'text-[var(--color-primary)]' : 'text-white'}`}>
                                    {mode.label}
                                </div>
                                <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                                    {mode.description}
                                </div>
                            </div>
                        </button>
                    );
                })}

                <div className="mt-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex gap-3">
                    <Info className="w-5 h-5 text-blue-400 mt-0.5" />
                    <p className="text-xs text-blue-300 leading-relaxed font-mono">
                        WE'LL USE THESE TO ADD PROTECTIVE BUFFERS, SUGGEST ENERGY-AWARE SLOTS, AND BUILD FLEXIBILITY WHERE YOU NEED IT MOST.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
