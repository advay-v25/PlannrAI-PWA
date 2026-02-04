'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Anchor, Clock, CalendarDays, X, Check } from 'lucide-react';

const DAYS = [
    { id: 1, label: 'M' },
    { id: 2, label: 'T' },
    { id: 3, label: 'W' },
    { id: 4, label: 'T' },
    { id: 5, label: 'F' },
    { id: 6, label: 'S' },
    { id: 0, label: 'S' },
];

export function CommitmentModal({ onClose, onSuccess }: { onClose: () => void, onSuccess?: () => void }) {
    const supabase = createClient();
    const [title, setTitle] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [duration, setDuration] = useState(60); // minutes
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [loading, setLoading] = useState(false);

    const toggleDay = (dayId: number) => {
        if (selectedDays.includes(dayId)) {
            setSelectedDays(selectedDays.filter(d => d !== dayId));
        } else {
            setSelectedDays([...selectedDays, dayId]);
        }
    };

    const handleSubmit = async () => {
        if (!title.trim() || selectedDays.length === 0) return;
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Calculate end time
            const [hours, minutes] = startTime.split(':').map(Number);
            const totalStartMins = hours * 60 + minutes;
            const totalEndMins = totalStartMins + duration;
            const endHour = Math.floor(totalEndMins / 60) % 24;
            const endMinute = totalEndMins % 60;
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

            const { error } = await supabase.from('commitments').insert({
                user_id: user.id,
                title,
                start_time: startTime,
                end_time: endTime,
                days_of_week: selectedDays,
                is_active: true
            });

            if (error) throw error;
            if (onSuccess) onSuccess();
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md glass-card p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <Anchor className="w-5 h-5 text-[var(--color-primary)]" />
                        <h2 className="text-xl font-bold">New Commitment</h2>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 opacity-50 hover:opacity-100" /></button>
                </div>

                <div className="space-y-6">
                    {/* Title */}
                    <div className="space-y-2">
                        <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">Title</label>
                        <GlassInput
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Work Block, School Run, Meeting..."
                            autoFocus
                        />
                    </div>

                    {/* Time & Duration */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Start Time
                            </label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-3 text-center text-lg font-mono outline-none focus:border-[var(--color-primary)]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Duration
                            </label>
                            <select
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-3 outline-none focus:border-[var(--color-primary)] appearance-none"
                            >
                                <option value={15}>15m</option>
                                <option value={30}>30m</option>
                                <option value={45}>45m</option>
                                <option value={60}>1h</option>
                                <option value={90}>1.5h</option>
                                <option value={120}>2h</option>
                                <option value={180}>3h</option>
                                <option value={240}>4h</option>
                                <option value={480}>8h</option>
                            </select>
                        </div>
                    </div>

                    {/* Days */}
                    <div className="space-y-2">
                        <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" /> Repeats On
                        </label>
                        <div className="flex gap-2 justify-between">
                            {DAYS.map(day => {
                                const isSelected = selectedDays.includes(day.id);
                                return (
                                    <button
                                        key={day.id}
                                        onClick={() => toggleDay(day.id)}
                                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${isSelected
                                            ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20'
                                            : 'bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:bg-[var(--glass-bg-hover)]'
                                            }`}
                                    >
                                        {day.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <GlassButton
                        variant="primary"
                        className="w-full py-4 text-base mt-2"
                        onClick={handleSubmit}
                        disabled={!title || selectedDays.length === 0 || loading}
                        loading={loading}
                    >
                        <Check className="w-4 h-4 mr-2" />
                        Set Anchor
                    </GlassButton>
                </div>
            </motion.div>
        </div>
    );
}
