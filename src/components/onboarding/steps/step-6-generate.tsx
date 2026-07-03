'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Check, Sparkles } from 'lucide-react';

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

const STATUSES = [
    "Protecting sleep windows...",
    "Locking fixed commitments...",
    "Distributing goals across pillars...",
    "Calculating optimal buffer paths...",
    "Optimizing for energy patterns...",
    "Finalizing week structure..."
];

export function Step6Generate() {
    const { data, updateData } = useOnboardingStore();
    const [phase, setPhase] = useState<'generating' | 'options'>('generating');
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Initializing PersonalOS...');

    const commitments = data.commitments || [];
    
    // Average sleep time is 8 hours (480 mins)
    const sleepMins = 480;

    // Average fixed commitment mins per day
    const averageFixedMins = commitments.reduce((acc, c) => {
        const [sh, sm] = c.start_time.split(':').map(Number);
        const [eh, em] = c.end_time.split(':').map(Number);
        const duration = (eh * 60 + em) - (sh * 60 + sm);
        const activeDaysCount = c.days_of_week.length;
        return acc + (duration * activeDaysCount) / 7;
    }, 0);

    const goals = data.goals || [];
    const userTotalGoalMins = goals.reduce((acc, g) => acc + (g.target_minutes_per_day * (g.days_per_week || 7)), 0);
    
    // Fallback default in case they have no goals selected
    const baseGoalMins = userTotalGoalMins > 0 ? userTotalGoalMins : 1800; 

    // Calculate dynamic values for each plan:
    const planMetrics = {
        balanced: {
            goal_minutes: baseGoalMins,
            total_blocks: Math.round((baseGoalMins / 45) * 1.1), // average 45 min blocks + buffer multiplier
            buffer_percentage: 15,
            intensity: 7
        },
        recovery: {
            goal_minutes: Math.round(baseGoalMins * 0.6),
            total_blocks: Math.round((baseGoalMins * 0.6 / 45) * 1.1),
            buffer_percentage: 25,
            intensity: 4
        },
        intense: {
            goal_minutes: Math.round(baseGoalMins * 1.3),
            total_blocks: Math.round((baseGoalMins * 1.3 / 45) * 1.1),
            buffer_percentage: 8,
            intensity: 9
        },
        skip: {
            goal_minutes: 0,
            total_blocks: 0,
            buffer_percentage: 0,
            intensity: 0
        }
    };

    const getPlanSegments = (optId: string) => {
        let goalMins = 0;
        if (optId === 'balanced') goalMins = planMetrics.balanced.goal_minutes / 7;
        else if (optId === 'recovery') goalMins = planMetrics.recovery.goal_minutes / 7;
        else if (optId === 'intense') goalMins = planMetrics.intense.goal_minutes / 7;

        // Routine / Winddown
        const routineMins = (data.wind_down_mins || 30) + (data.morning_routine_mins || 0);

        // Sleep segment
        const sleepHours = Math.round((sleepMins / 60) * 10) / 10;
        // Fixed segment
        const fixedHours = Math.round((averageFixedMins / 60) * 10) / 10;
        // Goals segment
        const goalHours = Math.round((goalMins / 60) * 10) / 10;
        // Routine segment
        const routineHours = Math.round((routineMins / 60) * 10) / 10;
        // Buffer / Free Time segment (remaining hours out of 24)
        const bufferHours = Math.max(0, Math.round((24 - sleepHours - fixedHours - goalHours - routineHours) * 10) / 10);

        const totalHours = sleepHours + fixedHours + goalHours + routineHours + bufferHours;

        const segments = [
            { label: 'Sleep 💤', hours: sleepHours, percentage: (sleepHours / totalHours) * 100, bgClass: 'bg-indigo-400' },
            { label: 'Fixed Anchors 🔒', hours: fixedHours, percentage: (fixedHours / totalHours) * 100, bgClass: 'bg-emerald-400' },
            { label: 'Growth Goals 🎯', hours: goalHours, percentage: (goalHours / totalHours) * 100, bgClass: 'bg-[var(--color-primary)]' },
            { label: 'Routine & Buffer 🍃', hours: Math.round((routineHours + bufferHours) * 10) / 10, percentage: ((routineHours + bufferHours) / totalHours) * 100, bgClass: 'bg-purple-400' }
        ];

        return segments.filter(s => s.hours > 0);
    };

    useEffect(() => {
        if (phase === 'generating') {
            const interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 100) {
                        setPhase('options');
                        return 100;
                    }
                    const next = prev + 1;
                    const statusIdx = Math.floor((next / 100) * STATUSES.length);
                    if (STATUSES[statusIdx]) setStatus(STATUSES[statusIdx]);
                    return next;
                });
            }, 50); // Mocks a 5s generation
            return () => clearInterval(interval);
        }
    }, [phase]);

    const options: ScheduleOption[] = [
        {
            id: 'balanced',
            label: 'Balanced Week',
            summary: 'Sustainable pace, moderate intensity, even goal distribution.',
            recommended: true,
            metrics: planMetrics.balanced
        },
        {
            id: 'recovery',
            label: 'Recovery Mode',
            summary: 'Lighter load, maximum flexibility, gentle start.',
            metrics: planMetrics.recovery
        },
        {
            id: 'intense',
            label: 'Intense Mode',
            summary: 'Maximum productivity, tight scheduling, ambitious progress.',
            metrics: planMetrics.intense
        },
        {
            id: 'skip',
            label: 'Skip for Now',
            summary: 'Go straight to your dashboard. You can generate a plan later.',
            metrics: planMetrics.skip
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
                            <h3 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight h-8">{status}</h3>
                            <div className="w-full h-1.5 bg-[var(--glass-bg)] rounded-full overflow-hidden shadow-inner">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="h-full bg-[var(--color-primary)] shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.8)]"
                                />
                            </div>
                            <p className="text-xs font-medium text-[var(--text-primary)]/60 tracking-wide">{progress}% Complete</p>
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
                            <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
                                Your <span className="text-[var(--color-primary)]">Options</span>
                            </h2>
                            <p className="text-[var(--text-primary)]/60 text-sm">Choose your preferred approach for your first week.</p>
                        </div>

                        <div className="space-y-5">
                            {options.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => updateData({ selected_variant_id: opt.id })}
                                    className={`w-full p-6 text-left relative group transition-all duration-500 rounded-3xl backdrop-blur-md shadow-xl ${
                                        selectedOption === opt.id
                                            ? 'scale-[1.03]'
                                            : 'hover:scale-[1.01]'
                                    }`}
                                >
                                    {/* Liquid glass background with shimmer sweep effect */}
                                    <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
                                        {selectedOption === opt.id && (
                                            <div className="absolute -inset-10 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.22)_0%,transparent_65%)] blur-xl pointer-events-none animate-pulse" />
                                        )}
                                        <div className={`absolute inset-0 transition-all duration-500 border ${
                                            selectedOption === opt.id
                                                ? 'bg-white/[0.08] border-transparent shadow-[0_0_25px_rgba(255,255,255,0.05)] animate-shimmer'
                                                : 'bg-[var(--glass-bg)] border-[var(--glass-border)] group-hover:bg-[var(--glass-bg-hover)]'
                                        }`} />
                                    </div>

                                    {opt.recommended && (
                                        <div className="absolute -top-3 left-6 bg-white text-black text-[10px] font-bold px-3 py-1 rounded-full tracking-wide shadow-lg z-10">
                                            Recommended
                                        </div>
                                    )}

                                    <div className="relative z-10 w-full flex flex-col">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className={`text-xl font-semibold tracking-tight transition-colors duration-300 ${selectedOption === opt.id ? 'text-[var(--color-primary)]' : 'text-[var(--text-primary)]'}`}>
                                                    {opt.label}
                                                </div>
                                                <p className="text-sm text-[var(--text-primary)]/70 mt-2 leading-relaxed font-medium pr-8">{opt.summary}</p>
                                            </div>
                                            {selectedOption === opt.id && (
                                                <div className="bg-white text-black p-1.5 rounded-full shadow-lg scale-110 ml-4 flex-shrink-0">
                                                    <Check className="w-5 h-5 stroke-[3]" />
                                                </div>
                                            )}
                                        </div>

                                        {opt.id !== 'skip' && (
                                            <div className="grid grid-cols-4 gap-3 p-4 rounded-2xl bg-[var(--glass-bg-active)] border border-[var(--glass-border)] shadow-inner">
                                                <Metric label="Blocks" value={opt.metrics.total_blocks} active={selectedOption === opt.id} />
                                                <Metric label="Buffer" value={`${opt.metrics.buffer_percentage}%`} active={selectedOption === opt.id} />
                                                <Metric label="Intensity" value={`${opt.metrics.intensity}/10`} active={selectedOption === opt.id} />
                                                <Metric label="Hrs/Day" value={Math.round(opt.metrics.goal_minutes/7/60 * 10)/10} active={selectedOption === opt.id} />
                                            </div>
                                        )}

                                        {selectedOption === opt.id && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-6 pt-5 border-t border-[var(--glass-border)] space-y-4 text-xs overflow-hidden"
                                            >
                                                <p className="font-bold text-[10px] text-[var(--color-primary)] tracking-widest uppercase">
                                                    Estimated Daily Time Distribution
                                                </p>

                                                {/* Visual Multi-segment Progress Bar */}
                                                <div className="h-2 w-full rounded-full bg-white/5 flex overflow-hidden">
                                                    {getPlanSegments(opt.id).map((seg, idx) => (
                                                        <div
                                                            key={idx}
                                                            style={{ width: `${seg.percentage}%` }}
                                                            className={`${seg.bgClass} h-full transition-all duration-500`}
                                                            title={`${seg.label}: ${seg.hours}h`}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Legend */}
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-medium text-[var(--text-primary)]/60">
                                                    {getPlanSegments(opt.id).map((seg, idx) => (
                                                        <div key={idx} className="flex items-center gap-2">
                                                            <span className={`w-2.5 h-2.5 rounded-full ${seg.bgClass}`} />
                                                            <span className="flex-1 text-[11px]">{seg.label}</span>
                                                            <span className="font-mono font-bold text-white text-[11px]">{seg.hours}h</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Short Text Overview Description */}
                                                <div className="bg-white/[0.03] border border-white/[0.04] p-3 rounded-2xl text-[11px] text-[var(--text-primary)]/75 leading-relaxed">
                                                    {opt.id === 'balanced' && (
                                                        "Expect a steady rhythm where goals are tackled in solid, manageable blocks. Ideal for keeping progress consistent without feeling overwhelmed."
                                                    )}
                                                    {opt.id === 'recovery' && (
                                                        "A gentle flow designed to prioritize rest and breathing room. Perfect if you need to recharge your batteries while maintaining a light baseline of progress."
                                                    )}
                                                    {opt.id === 'intense' && (
                                                        <span>
                                                            A packed, highly productive schedule designed for rapid acceleration. <strong className="text-[var(--color-primary)] font-bold">Please note:</strong> This mode scales up your target times, assigning <strong className="text-[var(--color-primary)] font-bold">30% more time</strong> to your growth goals than you originally allocated. Requires high discipline.
                                                        </span>
                                                    )}
                                                    {opt.id === 'skip' && (
                                                        "Your weekly schedule will be blank, giving you complete freedom to build your blocks from scratch directly on the calendar interface."
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
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
            <span className="text-[10px] font-semibold text-[var(--text-primary)]/50 tracking-wide mb-1">{label}</span>
            <span className={`text-lg font-bold tracking-tight transition-colors duration-300 ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70'}`}>{value}</span>
        </div>
    );
}
