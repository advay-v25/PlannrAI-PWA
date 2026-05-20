'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassButton } from '@/components/ui/glass-button';
import { Clock, Check, CalendarPlus, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

export interface RoutineRecommendation {
    routine: any;
    source?: string;
    accepted?: boolean;
}

interface RoutineCardProps {
    recommendation: RoutineRecommendation;
    onSchedule: (time: string, date: string) => Promise<void>;
}

export function RoutineCard({ recommendation, onSchedule }: RoutineCardProps) {
    const r = recommendation.routine;
    const [isScheduling, setIsScheduling] = useState(false);
    const defaultTime = r.best_time_window?.toLowerCase().includes('morning') ? '08:00' :
                        r.best_time_window?.toLowerCase().includes('afternoon') ? '14:00' :
                        r.best_time_window?.toLowerCase().includes('evening') ? '20:00' : '09:00';
    const [selectedTime, setSelectedTime] = useState(defaultTime);
    const [isExpanded, setIsExpanded] = useState(true);

    const handleConfirmSchedule = async () => {
        setIsScheduling(true);
        try {
            // Use today's date for now
            const date = new Date().toISOString().split('T')[0];
            await onSchedule(selectedTime, date);
        } finally {
            setIsScheduling(false);
        }
    };

    return (
        <div className="w-full">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl overflow-hidden"
            >
                {/* Header */}
                <div
                    className="p-6 flex items-start justify-between cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-[10px] uppercase font-bold tracking-wider">
                                {r.routine_type}
                            </span>
                            {recommendation.source === 'mixed' && (
                                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                                    Bio-Adapted
                                </span>
                            )}
                        </div>
                        <h3 className="text-xl font-bold font-display">{r.name}</h3>
                        <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.duration_minutes}m</span>
                            <span>•</span>
                            <span className="capitalize">{r.goal} Focus</span>
                            <span>•</span>
                            <span className="capitalize">{r.intensity} Intensity</span>
                        </div>
                    </div>
                    <button className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-tertiary)]">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                    <div className="px-6 pb-6 space-y-6">
                        {/* Warning if exists */}
                        {r.avoid_today && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-200 text-sm">
                                ⚠️ {r.avoid_today}
                            </div>
                        )}

                        {/* Steps */}
                        <div className="space-y-3">
                            {r.steps.map((step: string, i: number) => (
                                <div key={i} className="flex gap-3">
                                    <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs font-mono shrink-0 mt-0.5">
                                        {i + 1}
                                    </div>
                                    <p className="text-sm leading-relaxed">{step}</p>
                                </div>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="pt-4 border-t border-[var(--glass-border)] flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-[var(--text-tertiary)]">
                                    Suggested: <span className="text-[var(--color-text-secondary)] font-mono">{r.best_time_window}</span>
                                </div>
                            </div>

                            {!recommendation.accepted ? (
                                <div className="flex gap-2">
                                    <GlassButton
                                        variant="primary"
                                        className="flex-1"
                                        onClick={handleConfirmSchedule}
                                        loading={isScheduling}
                                    >
                                        <CalendarPlus className="w-4 h-4 mr-2" />
                                        Add to Calendar
                                    </GlassButton>

                                    <input
                                        type="time"
                                        value={selectedTime}
                                        onChange={(e) => setSelectedTime(e.target.value)}
                                        className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] w-24 text-center cursor-pointer"
                                    />
                                </div>
                            ) : (
                                <div className="w-full py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm">
                                    <Check className="w-4 h-4" /> Scheduled
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
