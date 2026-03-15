'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Check, Loader2, Sparkles, TrendingUp, Zap, ShieldAlert } from 'lucide-react';

interface ScheduleOption {
    id: string;
    label: string;
    summary: string;
    metrics: {
        total_blocks: number;
        goal_minutes: number;
        buffer_percentage: number;
        intensity: number;
    };
    recommended?: boolean;
}

export function Step6Generate() {
    const { data, updateData } = useOnboardingStore();
    const [phase, setPhase] = useState<'generating' | 'options'>('generating');
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Initializing PersonalOS...');

    const statuses = [
        "Protecting sleep windows...",
        "Locking fixed commitments...",
        "Distributing goals across pillars...",
        "Calculating optimal buffer paths...",
        "Optimizing for energy patterns...",
        "Finalizing week structure..."
    ];

    useEffect(() => {
        if (phase === 'generating') {
            const interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 100) {
                        setPhase('options');
                        return 100;
                    }
                    const next = prev + 1;
                    const statusIdx = Math.floor((next / 100) * statuses.length);
                    if (statuses[statusIdx]) setStatus(statuses[statusIdx]);
                    return next;
                });
            }, 50); // Mocks a 5s generation
            return () => clearInterval(interval);
        }
    }, [phase]);

    const options: ScheduleOption[] = [
        {
            id: 'balanced',
            label: 'BALANCED WEEK',
            summary: 'Sustainable pace, moderate intensity, even goal distribution.',
            recommended: true,
            metrics: { total_blocks: 42, goal_minutes: 1800, buffer_percentage: 15, intensity: 7 }
        },
        {
            id: 'recovery',
            label: 'RECOVERY MODE',
            summary: 'Lighter load, maximum flexibility, gentle start.',
            metrics: { total_blocks: 32, goal_minutes: 1200, buffer_percentage: 25, intensity: 4 }
        },
        {
            id: 'intense',
            label: 'INTENSE MODE',
            summary: 'Maximum productivity, tight scheduling, ambitious progress.',
            metrics: { total_blocks: 54, goal_minutes: 2400, buffer_percentage: 8, intensity: 9 }
        }
    ];

    const selectedOption = data.selected_variant_id || 'balanced';

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-lg mx-auto">
            <AnimatePresence mode="wait">
                {phase === 'generating' ? (
                    <motion.div
                        key="generating"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="flex flex-col items-center space-y-8 w-full"
                    >
                        <div className="relative">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                className="w-32 h-32 rounded-full border-t-2 border-r-2 border-[var(--color-primary)] border-b-2 border-l-2 border-transparent"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles className="w-10 h-10 text-[var(--color-primary)] animate-pulse" />
                            </div>
                        </div>

                        <div className="text-center space-y-4 w-full">
                            <h3 className="text-2xl font-bold text-white font-mono tracking-tighter uppercase">{status}</h3>
                            <div className="w-full h-1 bg-[var(--glass-surface)] rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="h-full bg-[var(--color-primary)]"
                                />
                            </div>
                            <p className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase tracking-widest">{progress}% COMPILED</p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="options"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 w-full pb-10"
                    >
                        <div className="text-center space-y-2 mb-8">
                            <h2 className="text-3xl font-bold text-white font-mono">YOUR <span className="text-[var(--color-primary)]">OPTIONS</span></h2>
                            <p className="text-[var(--color-text-secondary)] text-sm">Choose your preferred approach for your first week.</p>
                        </div>

                        <div className="space-y-4">
                            {options.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => updateData({ selected_variant_id: opt.id })}
                                    className={`w-full p-5 rounded-2xl border transition-all text-left relative group ${
                                        selectedOption === opt.id
                                            ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/20'
                                            : 'bg-[var(--glass-surface)] border-[var(--glass-border)] hover:border-gray-500'
                                    }`}
                                >
                                    {opt.recommended && (
                                        <div className="absolute -top-3 left-4 bg-[var(--color-primary)] text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                            Recommended
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className={`text-lg font-black font-mono tracking-tight transition-colors ${selectedOption === opt.id ? 'text-[var(--color-primary)]' : 'text-white'}`}>
                                                {opt.label}
                                            </div>
                                            <p className="text-sm text-[var(--color-text-tertiary)] mt-1 leading-tight">{opt.summary}</p>
                                        </div>
                                        {selectedOption === opt.id && (
                                            <div className="bg-[var(--color-primary)] text-black p-1 rounded-full">
                                                <Check className="w-4 h-4" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-4 gap-2 mt-4">
                                        <Metric label="Blocks" value={opt.metrics.total_blocks} />
                                        <Metric label="Buffer" value={`${opt.metrics.buffer_percentage}%`} />
                                        <Metric label="Intensity" value={`${opt.metrics.intensity}/10`} />
                                        <Metric label="Hrs/Day" value={Math.round(opt.metrics.goal_minutes/7/60 * 10)/10} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] uppercase">{label}</span>
            <span className="text-sm font-bold text-white font-mono">{value}</span>
        </div>
    );
}
