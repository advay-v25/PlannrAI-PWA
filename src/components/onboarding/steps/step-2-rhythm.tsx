'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Clock, Coffee, Shield, Zap } from 'lucide-react';

export function Step2Rhythm() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="flex flex-col items-center justify-start space-y-8 w-full max-w-xl mx-auto pb-24">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 text-center"
            >
                <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] font-mono uppercase">
                    YOUR <span className="text-[var(--color-primary)]">DAILY RHYTHM</span>
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
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent'
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
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent'
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                    }`}
                                >
                                    {mins === 0 ? 'NONE' : `${mins} MIN`}
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
                                    onClick={() => updateData({ meals_per_day: num as 2 | 3 })}
                                    className={`py-5 rounded-3xl text-sm font-bold tracking-wide transition-all duration-300 flex-1 flex flex-col items-center justify-center gap-2 border ${
                                        data.meals_per_day === num 
                                            ? 'bg-white text-black shadow-[0_0_25px_rgba(255,255,255,0.4)] scale-[1.02] border-transparent' 
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.01]'
                                    }`}
                                >
                                    <span className="text-3xl drop-shadow-md">{num === 2 ? '🍳🥗' : '🍳🥗🍲'}</span>
                                    {num} MEALS
                                </button>
                            ))}
                        </div>
                    </div>

                    {data.meals_per_day === 2 && (
                        <div className="space-y-3 pt-2">
                            <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Which two meals?</label>
                            <div className="flex gap-2.5">
                                {[
                                    { id: 'breakfast_lunch', label: 'Breakfast & Lunch' },
                                    { id: 'lunch_dinner', label: 'Lunch & Dinner' },
                                    { id: 'breakfast_dinner', label: 'Breakfast & Dinner' }
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => updateData({ two_meals_selection: opt.id as any })}
                                        className={`py-3 rounded-2xl text-xs font-bold transition-all duration-300 flex-1 border tracking-wide ${
                                            data.two_meals_selection === opt.id 
                                                ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent' 
                                                : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3 pt-4">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Usual Meal Times</label>
                        <div className="grid grid-cols-3 gap-3">
                            {(data.meals_per_day === 3 || data.two_meals_selection.includes('breakfast')) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase ml-1 block">Breakfast</label>
                                    <input
                                        type="time"
                                        value={data.custom_meal_times.breakfast || '08:00'}
                                        onChange={(e) => updateData({ custom_meal_times: { ...data.custom_meal_times, breakfast: e.target.value } })}
                                        className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-white transition-all font-mono text-sm text-center shadow-inner"
                                    />
                                </div>
                            )}
                            {(data.meals_per_day === 3 || data.two_meals_selection.includes('lunch')) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase ml-1 block">Lunch</label>
                                    <input
                                        type="time"
                                        value={data.custom_meal_times.lunch || '13:00'}
                                        onChange={(e) => updateData({ custom_meal_times: { ...data.custom_meal_times, lunch: e.target.value } })}
                                        className="w-full bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:border-[var(--glass-border)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-white transition-all font-mono text-sm text-center shadow-inner"
                                    />
                                </div>
                            )}
                            {(data.meals_per_day === 3 || data.two_meals_selection.includes('dinner')) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase ml-1 block">Dinner</label>
                                    <input
                                        type="time"
                                        value={data.custom_meal_times.dinner || '19:30'}
                                        onChange={(e) => updateData({ custom_meal_times: { ...data.custom_meal_times, dinner: e.target.value } })}
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
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent' 
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
        </div>
    );
}
