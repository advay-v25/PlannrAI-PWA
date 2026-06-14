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
        <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-xl mx-auto">
            <AnimatePresence mode="wait">
                {phase === 'generating' ? (
                    <motion.div
                        key="generating"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="flex flex-col items-center space-y-12 w-full"
                    >
                        <div className="relative">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                className="w-32 h-32 rounded-full border-t-[3px] border-r-[3px] border-[var(--color-primary)] border-b-0 border-l-0 border-transparent shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.3)]"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles className="w-10 h-10 text-[var(--color-primary)] animate-pulse drop-shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.8)]" />
                            </div>
                        </div>

                        <div className="text-center space-y-5 w-full max-w-sm">
                            <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-widest uppercase h-8 drop-shadow-md">{status}</h3>
                            <div className="w-full h-1.5 bg-[var(--glass-bg)] rounded-full overflow-hidden shadow-inner">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="h-full bg-[var(--color-primary)] shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.8)]"
                                />
                            </div>
                            <p className="text-[10px] font-bold text-[var(--text-primary)]/40 uppercase tracking-[0.2em]">{progress}% COMPILED</p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="options"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-8 w-full pb-10"
                    >
                        <div className="text-center space-y-3 mb-10">
                            <h2 className="text-4xl font-bold text-[var(--text-primary)] font-mono uppercase tracking-tight">YOUR <span className="text-[var(--color-primary)]">OPTIONS</span></h2>
                            <p className="text-[var(--text-primary)]/60 tracking-wider text-sm">Choose your preferred approach for your first week.</p>
                        </div>

                        <div className="space-y-5">
                            {options.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => updateData({ selected_variant_id: opt.id })}
                                    className={`w-full p-6 text-left relative group transition-all duration-500 rounded-3xl backdrop-blur-md shadow-xl ${
                                        selectedOption === opt.id
                                            ? 'bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-[0_0_40px_rgba(255,255,255,0.1)] scale-[1.03]'
                                            : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:scale-[1.01]'
                                    }`}
                                >
                                    {opt.recommended && (
                                        <div className="absolute -top-3 left-6 bg-white text-black text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">
                                            Recommended
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className={`text-xl font-black font-mono tracking-tight transition-colors duration-300 ${selectedOption === opt.id ? 'text-[var(--color-primary)] drop-shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.4)]' : 'text-[var(--text-primary)]'}`}>
                                                {opt.label}
                                            </div>
                                            <p className="text-sm text-[var(--text-primary)]/60 mt-2 leading-relaxed font-medium tracking-wide pr-8">{opt.summary}</p>
                                        </div>
                                        {selectedOption === opt.id && (
                                            <div className="bg-white text-black p-1.5 rounded-full shadow-lg scale-110 ml-4 flex-shrink-0">
                                                <Check className="w-5 h-5 stroke-[3]" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-4 gap-3 p-4 rounded-2xl bg-[var(--glass-bg-active)] border border-[var(--glass-border)] shadow-inner">
                                        <Metric label="Blocks" value={opt.metrics.total_blocks} active={selectedOption === opt.id} />
                                        <Metric label="Buffer" value={`${opt.metrics.buffer_percentage}%`} active={selectedOption === opt.id} />
                                        <Metric label="Intensity" value={`${opt.metrics.intensity}/10`} active={selectedOption === opt.id} />
                                        <Metric label="Hrs/Day" value={Math.round(opt.metrics.goal_minutes/7/60 * 10)/10} active={selectedOption === opt.id} />
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

function Metric({ label, value, active }: { label: string; value: string | number; active?: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-bold text-[var(--text-primary)]/40 uppercase tracking-widest mb-1">{label}</span>
            <span className={`text-lg font-black font-mono tracking-tight transition-colors duration-300 ${active ? 'text-[var(--text-primary)] drop-shadow-md' : 'text-[var(--text-primary)]/70'}`}>{value}</span>
        </div>
    );
}
