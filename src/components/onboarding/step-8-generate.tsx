'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Sparkles, CalendarCheck, RefreshCw, AlertCircle } from 'lucide-react';

export function Step8Generate() {
    const { data } = useOnboardingStore();
    const [generating, setGenerating] = useState(true);
    const [generatedPlan, setGeneratedPlan] = useState<any>(null);

    const [thinkingStep, setThinkingStep] = useState(0);
    const thinkingMessages = [
        "Initializing Neural Synthesis Engine...",
        "Calibrating biological energy rhythms...",
        "Mapping high-importance goal vectors...",
        "Resolving commitment conflicts...",
        "Optimizing for maximum life harmony...",
        "Synthesizing Strategic Master Plan...",
        "Donna is finalizing your optimization..."
    ];

    // Thinking animation, then show preview
    useEffect(() => {
        const messageInterval = setInterval(() => {
            setThinkingStep(prev => prev < thinkingMessages.length - 1 ? prev + 1 : prev);
        }, 800);

        // After 4 seconds of animation, show the static preview
        const timer = setTimeout(() => {
            setGenerating(false);
            setGeneratedPlan({
                schedule: [
                    { time: data.sleep_end || '07:00', title: 'Wake Up & Hydrate', type: 'bio' },
                    { time: data.meal_windows?.breakfast || '08:00', title: 'Breakfast', type: 'meal' },
                    ...data.goals.map((g, i) => ({
                        time: `${String(9 + i).padStart(2, '0')}:30`,
                        title: g.title,
                        type: 'work'
                    })),
                    { time: data.meal_windows?.lunch || '12:30', title: 'Lunch', type: 'meal' },
                    { time: data.meal_windows?.dinner || '19:00', title: 'Dinner', type: 'meal' },
                    { time: data.sleep_start || '23:00', title: 'Sleep', type: 'bio' },
                ]
            });
        }, 4000);

        return () => {
            clearTimeout(timer);
            clearInterval(messageInterval);
        };
    }, [data]);

    if (generating) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-6 text-center">
                <div className="w-24 h-24 relative">
                    <div className="absolute inset-0 border-4 border-[var(--glass-border)] rounded-full" />
                    <div className="absolute inset-0 border-4 border-t-[var(--color-primary)] rounded-full animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-[var(--color-primary)] animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold animate-pulse">Synthesizing Your Day...</h2>
                <motion.p
                    key={thinkingStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-[var(--color-text-secondary)] text-sm max-w-xs h-6"
                >
                    {thinkingMessages[thinkingStep]}
                </motion.p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col w-full max-w-3xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-display font-light">Your Calibration</h2>
                <p className="text-[var(--color-text-secondary)]">A blueprint for a livable day.</p>
            </div>

            <div className="flex-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-6 overflow-hidden flex flex-col relative">
                {/* Timeline Visualization */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative space-y-4">
                    {/* Wake Anchor */}
                    <TimelineItem time={data.sleep_end} title="System Online" type="anchor" />

                    {/* Generated Blocks */}
                    {generatedPlan?.schedule.map((block: any, i: number) => {
                        if (block.time === data.sleep_end || block.time === data.sleep_start) return null;
                        return <TimelineItem key={i} time={block.time} title={block.title} type={block.type} />;
                    })}

                    {/* Sleep Anchor */}
                    <TimelineItem time={data.sleep_start} title="System Standby" type="anchor" />
                </div>

                {/* Overlay Gradient for Scroll */}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent pointer-events-none" />
            </div>

            <div className="mt-8 flex justify-center text-sm text-[var(--text-tertiary)] gap-6">
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-400" /> Bio / Energy</span>
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400" /> Work / Goals</span>
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-400" /> Meals</span>
            </div>
        </div>
    );
}

function TimelineItem({ time, title, type }: any) {
    const getColor = (t: string) => {
        if (t === 'bio') return 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200';
        if (t === 'work') return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200';
        if (t === 'meal') return 'bg-orange-500/20 border-orange-500/50 text-orange-200';
        return 'bg-white/5 border-white/10 text-white/50';
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-center gap-4 p-3 rounded-lg border ${getColor(type)}`}
        >
            <span className="font-mono font-bold text-sm w-16 text-right opacity-70">{time}</span>
            <span className="font-medium text-sm">{title}</span>
        </motion.div>
    );
}

// Helpers
function addMinutes(time: string, mins: number) {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function subtractMinutes(time: string, mins: number) {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m - mins);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
