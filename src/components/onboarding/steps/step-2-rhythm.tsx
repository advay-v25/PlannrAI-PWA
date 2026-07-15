'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { CHRONOTYPE_ARCHETYPES } from '@/lib/chronotype';

export function Step2Rhythm() {
    const { data, updateData } = useOnboardingStore();
    const [selected, setSelected] = useState<('breakfast' | 'lunch' | 'dinner')[]>(() => {
        if (data.meals_per_day === 2 && data.two_meals_selection) {
            const meals: ('breakfast' | 'lunch' | 'dinner')[] = [];
            if (data.two_meals_selection.includes('breakfast')) meals.push('breakfast');
            if (data.two_meals_selection.includes('lunch')) meals.push('lunch');
            if (data.two_meals_selection.includes('dinner')) meals.push('dinner');
            return meals;
        }
        return [];
    });
    const [pendingSwitch, setPendingSwitch] = useState<{
        from: 'breakfast' | 'lunch' | 'dinner';
        to: 'breakfast' | 'lunch' | 'dinner';
    } | null>(null);

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    const getStoreValue = (m1: 'breakfast' | 'lunch' | 'dinner', m2: 'breakfast' | 'lunch' | 'dinner') => {
        const sorted = [m1, m2].sort();
        if (sorted[0] === 'breakfast' && sorted[1] === 'lunch') return 'breakfast_lunch';
        if (sorted[0] === 'lunch' && sorted[1] === 'dinner') return 'lunch_dinner';
        return 'breakfast_dinner';
    };

    const handleMealClick = (meal: 'breakfast' | 'lunch' | 'dinner') => {
        if (selected.includes(meal)) {
            // Deselecting a meal
            const nextSelected = selected.filter(m => m !== meal);
            setSelected(nextSelected);
            updateData({ two_meals_selection: null });
        } else {
            if (selected.length < 2) {
                const nextSelected = [...selected, meal];
                setSelected(nextSelected);
                if (nextSelected.length === 2) {
                    const val = getStoreValue(nextSelected[0], nextSelected[1]);
                    updateData({ two_meals_selection: val });
                }
            } else {
                // Attempting to select a third meal option
                const mostRecent = selected[1];
                setPendingSwitch({ from: mostRecent, to: meal });
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-start space-y-8 w-full max-w-xl mx-auto pb-24">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 text-center"
            >
                <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
                    Your <span className="text-[var(--color-primary)]">Daily Rhythm</span>
                </h2>
                <p className="text-[var(--text-primary)]/60 tracking-wide text-sm">
                    When does your body naturally operate best?
                </p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="w-full space-y-8 mt-4"
            >
                {/* 🌙 SLEEP & WAKE */}
                <div className="space-y-6 bg-[var(--glass-bg)] border border-[var(--glass-border)] p-7 rounded-3xl backdrop-blur-md shadow-lg">
                    <div className="flex items-center gap-3 text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest border-b border-[var(--glass-border)] pb-4">
                        <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">🌙</span> SLEEP & WAKE
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Usually fall asleep</label>
                            <input
                                type="time"
                                value={data.sleep_start}
                                onChange={(e) => updateData({ sleep_start: e.target.value })}
                                className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] rounded-2xl p-4 text-[var(--text-primary)] focus:outline-none focus:border-white transition-all font-mono tracking-wider shadow-inner"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Usually wake up</label>
                            <input
                                type="time"
                                value={data.sleep_end}
                                onChange={(e) => updateData({ sleep_end: e.target.value })}
                                className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] rounded-2xl p-4 text-[var(--text-primary)] focus:outline-none focus:border-white transition-all font-mono tracking-wider shadow-inner"
                            />
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Wind-down time before sleep</label>
                        <div className="flex gap-2.5">
                            {[15, 30, 45, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ wind_down_mins: mins })}
                                    className={`py-3.5 rounded-2xl text-xs font-bold font-mono transition-all duration-300 flex-1 border ${
                                        data.wind_down_mins === mins
                                            ? 'bg-[var(--color-primary)] text-white shadow-[0_0_20px_var(--color-primary-glow)] scale-[1.03] border-transparent'
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                    }`}
                                >
                                    {mins} MIN
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Morning routine buffer (after wake up)</label>
                        <p className="text-[10px] text-[var(--text-primary)]/40 ml-1 -mt-1">Shower, breakfast, getting ready — no blocks scheduled during this window</p>
                        <div className="flex gap-2.5">
                            {[0, 15, 30, 45, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ morning_routine_mins: mins })}
                                    className={`py-3.5 rounded-2xl text-xs font-bold font-mono transition-all duration-300 flex-1 border ${
                                        data.morning_routine_mins === mins
                                            ? 'bg-[var(--color-primary)] text-white shadow-[0_0_20px_var(--color-primary-glow)] scale-[1.03] border-transparent'
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                    }`}
                                >
                                    {mins === 0 ? 'NONE' : `${mins} MIN`}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ⏰ ARCHETYPE */}
                <div className="space-y-6 bg-[var(--glass-bg)] border border-[var(--glass-border)] p-7 rounded-3xl backdrop-blur-md shadow-lg">
                    <div className="flex items-center gap-3 text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest border-b border-[var(--glass-border)] pb-4">
                        <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">⏰</span> ARCHETYPE
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">When are you sharpest?</label>
                        <div className="grid grid-cols-2 gap-2.5">
                            {CHRONOTYPE_ARCHETYPES.map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => updateData({ chronotype: opt.id as 'lark' | 'bear' | 'owl' | 'wolf' })}
                                    className={`py-3.5 px-3 rounded-2xl text-left transition-all duration-300 border ${
                                        data.chronotype === opt.id
                                            ? 'bg-[var(--color-primary)] text-white shadow-[0_0_20px_var(--color-primary-glow)] scale-[1.02] border-transparent'
                                            : 'bg-[var(--glass-bg-active)] border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:scale-[1.01]'
                                    }`}
                                >
                                    <div className={`text-xs font-bold tracking-wide ${data.chronotype === opt.id ? 'text-white' : 'text-[var(--text-primary)]/80'}`}>
                                        {opt.label}
                                    </div>
                                    <div className={`text-[10px] mt-0.5 ${data.chronotype === opt.id ? 'text-white/80' : 'text-[var(--text-primary)]/40'}`}>
                                        {opt.hint}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 🍽️ MEALS */}
                <div className="space-y-6 bg-[var(--glass-bg)] border border-[var(--glass-border)] p-7 rounded-3xl backdrop-blur-md shadow-lg">
                    <div className="flex items-center gap-3 text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest border-b border-[var(--glass-border)] pb-4">
                        <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">🍽️</span> MEALS
                    </div>
                    
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Meals per day</label>
                        <div className="flex gap-4">
                            {[2, 3].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => updateData({ 
                                        meals_per_day: num as 2 | 3,
                                        ...(num === 2 ? { two_meals_selection: null } : {})
                                    })}
                                    className={`py-5 rounded-3xl text-sm font-bold tracking-wide transition-all duration-300 flex-1 flex flex-col items-center justify-center gap-2 border ${
                                        data.meals_per_day === num 
                                            ? 'bg-[var(--color-primary)] text-white shadow-[0_0_25px_var(--color-primary-glow)] scale-[1.02] border-transparent' 
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.01]'
                                    }`}
                                >
                                    <span className="text-3xl drop-shadow-md">{num === 2 ? '🍳🥗' : '🍳🥗🍲'}</span>
                                    {num} MEALS
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <label className={`text-[10px] font-bold tracking-widest uppercase ml-1 transition-colors duration-300 ${
                            data.meals_per_day === 3 ? 'text-[var(--text-primary)]/20' : 'text-[var(--text-primary)]/50'
                        }`}>
                            Which two meals?
                        </label>
                        <div className="flex gap-2.5">
                            {[
                                { id: 'breakfast', label: 'Breakfast' },
                                { id: 'lunch', label: 'Lunch' },
                                { id: 'dinner', label: 'Dinner' }
                            ].map((opt) => {
                                const isDisabled = data.meals_per_day === 3;
                                const isSelected = !isDisabled && selected.includes(opt.id as 'breakfast' | 'lunch' | 'dinner');
                                return (
                                    <button
                                        type="button"
                                        key={opt.id}
                                        disabled={isDisabled}
                                        onClick={() => handleMealClick(opt.id as 'breakfast' | 'lunch' | 'dinner')}
                                        className={`py-3.5 rounded-2xl text-xs font-bold transition-all duration-300 flex-1 border tracking-wide ${
                                            isDisabled
                                                ? 'bg-[var(--glass-bg)] text-[var(--text-primary)]/20 border-white/[0.03] cursor-not-allowed shadow-none'
                                                : isSelected
                                                    ? 'bg-[var(--color-primary)] text-white shadow-[0_0_20px_var(--color-primary-glow)] scale-[1.03] border-transparent'
                                                    : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-3 pt-4">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Usual Meal Times</label>
                        <div className="grid grid-cols-3 gap-3">
                            {(data.meals_per_day === 3 || data.two_meals_selection?.includes('breakfast')) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase ml-1 block">Breakfast</label>
                                    <input
                                        type="time"
                                        value={data.custom_meal_times?.breakfast || '08:00'}
                                        onChange={(e) => updateData({ custom_meal_times: { ...(data.custom_meal_times || {}), breakfast: e.target.value } })}
                                        className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-white transition-all font-mono text-sm text-center shadow-inner"
                                    />
                                </div>
                            )}
                            {(data.meals_per_day === 3 || data.two_meals_selection?.includes('lunch')) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase ml-1 block">Lunch</label>
                                    <input
                                        type="time"
                                        value={data.custom_meal_times?.lunch || '13:00'}
                                        onChange={(e) => updateData({ custom_meal_times: { ...(data.custom_meal_times || {}), lunch: e.target.value } })}
                                        className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-white transition-all font-mono text-sm text-center shadow-inner"
                                    />
                                </div>
                            )}
                            {(data.meals_per_day === 3 || data.two_meals_selection?.includes('dinner')) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase ml-1 block">Dinner</label>
                                    <input
                                        type="time"
                                        value={data.custom_meal_times?.dinner || '19:30'}
                                        onChange={(e) => updateData({ custom_meal_times: { ...(data.custom_meal_times || {}), dinner: e.target.value } })}
                                        className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-white transition-all font-mono text-sm text-center shadow-inner"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ⏱️ BUFFER TIME */}
                <div className="space-y-6 bg-[var(--glass-bg)] border border-[var(--glass-border)] p-7 rounded-3xl backdrop-blur-md shadow-lg">
                    <div className="flex items-center gap-3 text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest border-b border-[var(--glass-border)] pb-4">
                        <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">⏱️</span> BUFFER TIME
                    </div>
                    
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Space between activities</label>
                        <div className="flex gap-2.5">
                            {[5, 10, 15].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ default_buffer_duration: mins })}
                                    className={`py-3.5 rounded-2xl text-xs font-bold font-mono transition-all duration-300 flex-1 border ${
                                        data.default_buffer_duration === mins 
                                            ? 'bg-[var(--color-primary)] text-white shadow-[0_0_20px_var(--color-primary-glow)] scale-[1.03] border-transparent' 
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                    }`}
                                >
                                    {mins} MIN
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                
            </motion.div>

            <AnimatePresence>
                {pendingSwitch && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-bg-primary)]/60 backdrop-blur-md">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-6 max-w-sm w-full mx-4 space-y-4 rounded-3xl shadow-2xl text-center backdrop-blur-xl animate-fade-in"
                        >
                            <h3 className="text-lg font-bold text-[var(--text-primary)] font-mono uppercase tracking-wide">
                                Switch Meal Selection?
                            </h3>
                            <p className="text-sm text-[var(--text-primary)]/70">
                                Would you like to switch from your most recently selected meal option (<span className="text-[var(--color-primary)] font-bold">{capitalize(pendingSwitch.from)}</span>) to <span className="text-[var(--color-primary)] font-bold">{capitalize(pendingSwitch.to)}</span>?
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPendingSwitch(null);
                                    }}
                                    className="flex-1 py-2.5 rounded-xl border border-[var(--glass-border)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--glass-bg-active)] transition-colors duration-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextSelected = [selected[0], pendingSwitch.to];
                                        setSelected(nextSelected);
                                        const val = getStoreValue(nextSelected[0], nextSelected[1]);
                                        updateData({ two_meals_selection: val });
                                        setPendingSwitch(null);
                                    }}
                                    className="flex-1 py-2.5 rounded-xl bg-[var(--color-primary)] hover:shadow-[0_0_15px_rgba(251,146,60,0.4)] text-xs font-bold text-white transition-colors duration-300"
                                >
                                    Switch
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
