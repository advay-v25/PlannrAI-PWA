'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { useToast } from '@/components/ui/toast';
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

interface CommitmentData {
    title: string;
    start_time: string;
    end_time: string;
    days_of_week: number[];
}

interface CommitmentModalProps {
    onClose: () => void;
    onSuccess?: (data: CommitmentData) => void;
}

export function CommitmentModal({ onClose, onSuccess }: CommitmentModalProps) {
    const supabase = createClient();
    const { showToast } = useToast();
    const [title, setTitle] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [loading, setLoading] = useState(false);

    const toggleDay = (dayId: number) => {
        if (selectedDays.includes(dayId)) {
            setSelectedDays(selectedDays.filter(d => d !== dayId));
        } else {
            setSelectedDays([...selectedDays, dayId]);
        }
    };

    // Validate end time is after start time
    const isValidTimeRange = () => {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        return endMinutes > startMinutes;
    };

    const handleSubmit = async () => {
        if (!title.trim()) {
            showToast('Please enter a title', 'error');
            return;
        }
        if (selectedDays.length === 0) {
            showToast('Please select at least one day', 'error');
            return;
        }
        if (!isValidTimeRange()) {
            showToast('End time must be after start time', 'error');
            return;
        }

        setLoading(true);

        try {
            // Validate and Sanitize Time to HH:MM (slice first 5 chars just in case)
            const safeStart = startTime.length > 5 ? startTime.slice(0, 5) : startTime;
            const safeEnd = endTime.length > 5 ? endTime.slice(0, 5) : endTime;

            const payload = {
                title: title.trim(),
                start_time: safeStart,
                end_time: safeEnd,
                days_of_week: selectedDays,
            };

            console.log("Submitting Anchor:", payload);

            let serverSuccess = false;
            try {
                const response = await fetch('/api/anchors', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                if (response.ok) {
                    serverSuccess = true;
                    const data = await response.json();
                    showToast('⚓ Anchor set!', 'success');
                } else {
                    console.warn("Anchor API Failed:", await response.text());
                    showToast('Saving locally (Sync pending)', 'info');
                }
            } catch (netError) {
                console.warn("Network Error on Anchor:", netError);
                showToast('Offline mode: Saved locally', 'info');
            }

            // Always update UI (Optimistic / Local Fallback)
            if (onSuccess) {
                onSuccess({
                    title: payload.title,
                    start_time: payload.start_time,
                    end_time: payload.end_time,
                    days_of_week: payload.days_of_week
                });
            }

            onClose();
        } catch (e: any) {
            console.error('Anchor Modal Critical Error:', e);
            showToast('Something went wrong', 'error');
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
                        <h2 className="text-xl font-bold">New Anchor</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                        <X className="w-5 h-5 opacity-50 hover:opacity-100" />
                    </button>
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

                    {/* Time Range - Start and End */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Start Time
                            </label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-3 text-center text-lg font-mono outline-none focus:border-[var(--color-primary)] transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> End Time
                            </label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className={`w-full bg-[var(--glass-bg)] border rounded-xl p-3 text-center text-lg font-mono outline-none transition-colors ${!isValidTimeRange() && endTime !== startTime
                                    ? 'border-red-500/50 focus:border-red-500'
                                    : 'border-[var(--glass-border)] focus:border-[var(--color-primary)]'
                                    }`}
                            />
                            {!isValidTimeRange() && endTime !== startTime && (
                                <p className="text-xs text-red-400">End time must be after start</p>
                            )}
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
                        disabled={!title.trim() || selectedDays.length === 0 || !isValidTimeRange() || loading}
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
