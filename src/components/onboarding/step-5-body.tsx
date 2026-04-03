'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Dumbbell, Footprints, Flame, StretchHorizontal, PersonStanding } from 'lucide-react';

const ACTIVITIES = [
    { id: 'walk', label: 'Walking', icon: Footprints, color: 'text-emerald-400' },
    { id: 'gym', label: 'Gym', icon: Dumbbell, color: 'text-orange-400' },
    { id: 'sport', label: 'Sports', icon: Flame, color: 'text-red-400' },
    { id: 'yoga', label: 'Yoga/Mobility', icon: StretchHorizontal, color: 'text-purple-400' },
    { id: 'mixed', label: 'Mixed', icon: PersonStanding, color: 'text-blue-400' },
];

export function Step5Body() {
    const { data, updateData } = useOnboardingStore();

    // Ensure body_preferences exists
    const prefs = data.body_preferences || { activity_types: [], preferred_time: 'morning', duration_mins: 30 };

    const toggleActivity = (id: string) => {
        const current = prefs.activity_types as string[];
        const updated = current.includes(id)
            ? current.filter((t: string) => t !== id)
            : [...current, id];

        updateData({
            body_preferences: { ...prefs, activity_types: updated }
        });
    };

    const setTime = (time: string) => {
        updateData({
            body_preferences: { ...prefs, preferred_time: time }
        });
    };

    return (
        <div className="h-full flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto w-full">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-display font-light">Movement Baseline</h2>
                <p className="text-[var(--color-text-secondary)] font-light">
                    How do you usually like to move your body?
                </p>
            </div>

            {/* Activity Types */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
                {ACTIVITIES.map(act => {
                    const isSelected = prefs.activity_types.includes(act.id);
                    return (
                        <button
                            key={act.id}
                            onClick={() => toggleActivity(act.id)}
                            className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${isSelected
                                ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                : 'bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-60 hover:opacity-100'
                                }`}
                        >
                            <act.icon className={`w-6 h-6 ${act.color}`} />
                            <span className="text-sm font-bold">{act.label}</span>
                        </button>
                    )
                })}
            </div>

            {/* Preferences */}
            <div className="w-full space-y-4 bg-[var(--glass-bg)] p-6 rounded-2xl border border-[var(--glass-border)]">
                <div className="space-y-2">
                    <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">When feels best?</label>
                    <div className="flex gap-2">
                        {['Morning', 'Afternoon', 'Evening'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTime(t.toLowerCase())}
                                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${prefs.preferred_time === t.toLowerCase()
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : 'bg-black/20 text-[var(--color-text-secondary)] hover:bg-black/40'
                                    }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between">
                        <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">Typical Duration</label>
                        <span className="text-sm font-mono font-bold text-[var(--color-primary)]">{prefs.duration_mins}m</span>
                    </div>
                    <input
                        type="range"
                        min={10} max={120} step={5}
                        value={prefs.duration_mins}
                        onChange={(e) => updateData({ body_preferences: { ...prefs, duration_mins: Number(e.target.value) } })}
                        className="w-full accent-[var(--color-primary)]"
                    />
                </div>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] italic opacity-60 text-center">
                Optional. Protection protocol.
                <br />
                PlannrAI uses this to protect your energy, not to force workouts.
            </p>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-[10px] font-mono text-[var(--color-primary)] uppercase tracking-widest text-center"
            >
                Energy protection active.
                <br />
                I will prevent scheduling conflicts during these sessions.
            </motion.div>
        </div>
    );
}
