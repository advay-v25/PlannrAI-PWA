'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Smile, Meh, Frown, Sun, Moon, CloudRain, RefreshCw, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { dispatchAppEvent } from '@/lib/events';

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
    const [modeBanner, setModeBanner] = useState<{
        type: string;
        message: string;
        action_label: string;
    } | null>(null);

    // If we already have data for today, show collapsed
    if (submitted) {
        const moodObj = MOODS.find(m => m.value === mood) || MOODS[2];
        const MoodIcon = moodObj.icon;

        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
            >
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3">
                    <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(level => (
                            <div
                                key={level}
                                className={cn(
                                    "h-4 w-1 rounded-full transition-all",
                                    level <= energy
                                        ? "bg-[var(--color-primary)] shadow-[0_0_6px_var(--color-primary)]"
                                        : "bg-[var(--glass-bg)]"
                                )}
                            />
                        ))}
                    </div>
                    <MoodIcon className={cn("h-4 w-4", moodObj.color)} />
                    <span className="text-xs text-[var(--text-secondary)]">
                        {energy < 3 
                            ? "Energy Forecasting: Low right now. Peak focus expected at 2 PM." 
                            : "Energy Forecasting: High right now. Ready for deep work."}
                    </span>
                    <button
                        onClick={() => setSubmitted(false)}
                        className="ml-auto text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        Update
                    </button>
                </div>

                {/* Mode Banner (appears after check-in if mode is non-default) */}
                <AnimatePresence>
                    {modeBanner && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={cn(
                                "rounded-2xl border px-4 py-3 flex items-center gap-3",
                                modeBanner.type === 'recovery'
                                    ? "bg-orange-500/10 border-orange-500/20"
                                    : modeBanner.type === 'momentum'
                                    ? "bg-emerald-500/10 border-emerald-500/20"
                                    : "bg-[var(--glass-bg)] border-[var(--glass-border)]"
                            )}
                        >
                            {modeBanner.type === 'recovery' ? (
                                <Shield className="h-4 w-4 text-orange-400 shrink-0" />
                            ) : (
                                <Zap className="h-4 w-4 text-emerald-400 shrink-0" />
                            )}
                            <span className={cn(
                                "text-xs font-medium flex-1",
                                modeBanner.type === 'recovery' ? "text-orange-400/80" : "text-emerald-400/80"
                            )}>
                                {modeBanner.message}
                            </span>
                            <button
                                onClick={() => {
                                    if (modeBanner.type === 'recovery') {
                                        dispatchAppEvent({ type: 'trigger', payload: 'chat_coach' });
                                    } else {
                                        dispatchAppEvent({
                                            type: 'schedule-recompute',
                                            payload: {
                                                source: 'energy_checkin_action',
                                                // @ts-ignore
                                                energy,
                                                mood,
                                                should_reoptimize: true,
                                                banner: modeBanner,
                                            }
                                        });
                                    }
                                }}
                                className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors shrink-0",
                                    modeBanner.type === 'recovery'
                                        ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                                        : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                )}
                            >
                                <span className="flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3" />
                                    {modeBanner.action_label}
                                </span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        );
    }

    const handleSubmit = async (overrideEnergy?: number, overrideMood?: string) => {
        const finalEnergy = overrideEnergy || energy;
        const finalMood = overrideMood || mood;

        if (finalEnergy === 0 || !finalMood) {
            toast.error('Select both energy & mood');
            return;
        }

        // Call the parent handler
        onCheckin(finalEnergy, finalMood);
        setSubmitted(true);
        setEnergy(finalEnergy);
        setMood(finalMood);
        toast.success('Check-in recorded');

        // Fetch the protocol response to get the mode banner
        try {
            await apiClient.post('/api/home/energy-checkin', {
                energy_level: finalEnergy,
                emotional_state: finalMood
            });
            // Note: The actual DB write already happened via onCheckin. This re-POST
            // is idempotent (upserts) and we mainly need the protocol response.
            // We could refactor to return protocol data from onCheckin, but this
            // keeps the component self-contained.
        } catch (e) {
            // Non-blocking — banner just won't show
        }

        // Dispatch schedule-recompute event for the sync hook
        // Short delay to ensure DB write is committed
        setTimeout(() => {
            const isNonDefault = finalEnergy <= 2 || finalEnergy >= 4 || finalMood === 'low' || finalMood === 'rough' || finalMood === 'great';

            if (finalEnergy >= 4 && (finalMood === 'great' || finalMood === 'good')) {
                setModeBanner({
                    type: 'momentum',
                    message: '⚡ Momentum Mode — Full power. Push for maximum output.',
                    action_label: 'Boost Schedule',
                });
            } else if (finalEnergy <= 2 || finalMood === 'rough' || (finalEnergy === 3 && finalMood === 'low')) {
                setModeBanner({
                    type: 'recovery',
                    message: '🛡 Recovery Mode — Light schedule. Only essentials today.',
                    action_label: 'Talk to Coach',
                });
            } else {
                setModeBanner(null);
            }

            if (isNonDefault && finalEnergy <= 2) {
                dispatchAppEvent({
                    type: 'trigger',
                    payload: 'chat_coach'
                });
            } else {
                dispatchAppEvent({
                    type: 'schedule-recompute',
                    payload: {
                        source: 'energy_checkin',
                        // @ts-ignore
                        energy: finalEnergy,
                        mood: finalMood,
                        should_reoptimize: isNonDefault,
                        suggestion: finalEnergy <= 2
                            ? 'Low energy detected. Want me to lighten today\'s schedule?'
                            : finalEnergy >= 4
                            ? 'High energy detected! Want me to load up today?'
                            : null,
                        banner: isNonDefault ? {
                            type: finalEnergy <= 2 || finalMood === 'rough' ? 'recovery' : 'momentum',
                            action_label: finalEnergy <= 2 ? 'Talk to Coach' : 'Boost Schedule',
                        } : null,
                    }
                });
            }
        }, 500);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 backdrop-blur-xl"
        >
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-[var(--color-primary-muted)]">
                    <Zap className="w-4 h-4 text-[var(--color-primary)]" />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                    How are you feeling?
                </h3>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={() => handleSubmit(2, 'low')}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-orange-500/20 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-all group"
                >
                    <Frown className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-wider">Low</span>
                </button>
                <button
                    onClick={() => handleSubmit(3, 'good')}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all group"
                >
                    <Smile className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-wider">Optimal</span>
                </button>
                <button
                    onClick={() => handleSubmit(5, 'great')}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all group"
                >
                    <Zap className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-wider">High</span>
                </button>
            </div>
        </motion.div>
    );
}
