'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Smile, Meh, Frown, Sun, Moon, CloudRain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EnergyCheckinProps {
    currentEnergy?: number;
    currentMood?: string;
    onCheckin: (energy: number, mood: string) => void;
}

const MOODS = [
    { value: 'great', icon: Sun, label: 'Great', color: 'text-yellow-400' },
    { value: 'good', icon: Smile, label: 'Good', color: 'text-green-400' },
    { value: 'neutral', icon: Meh, label: 'Okay', color: 'text-blue-400' },
    { value: 'low', icon: Frown, label: 'Low', color: 'text-orange-400' },
    { value: 'rough', icon: CloudRain, label: 'Rough', color: 'text-red-400' }
];

export function EnergyCheckin({ currentEnergy, currentMood, onCheckin }: EnergyCheckinProps) {
    const [energy, setEnergy] = useState(currentEnergy || 0);
    const [mood, setMood] = useState(currentMood || '');
    const [submitted, setSubmitted] = useState(!!currentEnergy);

    // If we already have data for today, show collapsed
    if (submitted) {
        const moodObj = MOODS.find(m => m.value === mood) || MOODS[2];
        const MoodIcon = moodObj.icon;

        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
            >
                <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(level => (
                        <div
                            key={level}
                            className={cn(
                                "h-4 w-1 rounded-full transition-all",
                                level <= energy
                                    ? "bg-[var(--color-primary)] shadow-[0_0_6px_var(--color-primary)]"
                                    : "bg-white/10"
                            )}
                        />
                    ))}
                </div>
                <MoodIcon className={cn("h-4 w-4", moodObj.color)} />
                <span className="text-xs text-white/40">Checked in</span>
                <button
                    onClick={() => setSubmitted(false)}
                    className="ml-auto text-[10px] text-white/30 hover:text-white/60 transition-colors"
                >
                    Update
                </button>
            </motion.div>
        );
    }

    const handleSubmit = () => {
        if (energy === 0 || !mood) {
            toast.error('Select both energy & mood');
            return;
        }
        onCheckin(energy, mood);
        setSubmitted(true);
        toast.success('Check-in recorded');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
        >
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-[var(--color-primary-muted)]">
                    <Zap className="w-4 h-4 text-[var(--color-primary)]" />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">
                    How are you feeling?
                </h3>
            </div>

            {/* Energy Slider */}
            <div className="mb-4">
                <label className="text-[10px] uppercase text-white/40 tracking-wider mb-2 block">
                    Energy Level
                </label>
                <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(level => (
                        <button
                            key={level}
                            onClick={() => setEnergy(level)}
                            className={cn(
                                "flex-1 h-10 rounded-xl border transition-all text-sm font-bold",
                                level <= energy
                                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-[var(--color-primary)] shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.2)]"
                                    : "border-white/10 bg-white/5 text-white/30 hover:bg-white/10"
                            )}
                        >
                            {level}
                        </button>
                    ))}
                </div>
            </div>

            {/* Mood Selection */}
            <div className="mb-4">
                <label className="text-[10px] uppercase text-white/40 tracking-wider mb-2 block">
                    Mood
                </label>
                <div className="flex gap-2">
                    {MOODS.map(m => {
                        const Icon = m.icon;
                        return (
                            <button
                                key={m.value}
                                onClick={() => setMood(m.value)}
                                className={cn(
                                    "flex-1 flex flex-col items-center gap-1 rounded-xl border p-2 transition-all",
                                    mood === m.value
                                        ? "border-white/30 bg-white/10"
                                        : "border-white/5 bg-white/5 hover:bg-white/10"
                                )}
                            >
                                <Icon className={cn("h-4 w-4", mood === m.value ? m.color : "text-white/30")} />
                                <span className={cn(
                                    "text-[9px] font-bold uppercase",
                                    mood === m.value ? "text-white/80" : "text-white/30"
                                )}>
                                    {m.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Submit */}
            <AnimatePresence>
                {energy > 0 && mood && (
                    <motion.button
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onClick={handleSubmit}
                        className="w-full rounded-xl bg-white py-3 text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Check In
                    </motion.button>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
