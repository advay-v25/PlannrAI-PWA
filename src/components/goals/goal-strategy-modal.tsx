'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { useToast } from '@/components/ui/toast';
import { X, Sparkles, Check, Calendar, List, Clock, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Replace, SkipForward } from 'lucide-react';
import type { Goal } from '@/types/database';

interface ConflictInfo {
    date: string;
    existingBlock: {
        id: string;
        context: string;
        start_time: string;
        end_time: string;
    };
}

interface GoalStrategyModalProps {
    goal: Goal;
    isOpen: boolean;
    onClose: () => void;
    onStrategyGenerated?: (strategy: any) => void;
}

export function GoalStrategyModal({
    goal,
    isOpen,
    onClose,
    onStrategyGenerated
}: GoalStrategyModalProps) {
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [strategy, setStrategy] = useState<any>(goal.ai_strategy || null);
    const [showScheduler, setShowScheduler] = useState(false);

    // Scheduling state
    const [scheduleDate, setScheduleDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });
    const [scheduleTime, setScheduleTime] = useState(() => {
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        return now.toTimeString().slice(0, 5);
    });
    const [isRecurring, setIsRecurring] = useState(false);
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
    const [scheduledWeeks, setScheduledWeeks] = useState(1); // 1-4 weeks

    // Conflict state
    const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
    const [showConflictDialog, setShowConflictDialog] = useState(false);

    // Sync strategy when goal changes
    useEffect(() => {
        setStrategy(goal.ai_strategy || null);
    }, [goal.ai_strategy]);

    const handleDecompose = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/ai/decompose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal_id: goal.id, constraint_level: 'Beginner' })
            });
            const data = await res.json();

            if (data.success && data.data?.plan) {
                setStrategy(data.data.plan);
                showToast('Strategy generated and saved!', 'ai', 3000);
                onStrategyGenerated?.(data.data.plan);
            } else if (data.plan) {
                setStrategy(data.plan);
                showToast('Strategy generated and saved!', 'ai', 3000);
                onStrategyGenerated?.(data.plan);
            } else {
                showToast('Failed to generate strategy', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to generate strategy', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSchedule = async (skipConflicts = false, replaceConflicts = false) => {
        if (!strategy) return;

        setIsScheduling(true);
        try {
            const res = await fetch('/api/goals/schedule-strategy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goal_id: goal.id,
                    start_time: scheduleTime,
                    date: scheduleDate,
                    recurring: isRecurring,
                    days_of_week: isRecurring ? selectedDays : undefined,
                    weeks: isRecurring ? scheduledWeeks : 1,
                    skipConflicts,
                    replaceConflicts
                })
            });

            const data = await res.json();

            if (res.status === 409 && data.data?.conflicts) {
                // Conflicts detected - show resolution dialog
                setConflicts(data.data.conflicts);
                setShowConflictDialog(true);
                return;
            }

            if (res.ok && data.success) {
                const blockCount = data.data?.blocks?.length || 1;
                const weeksText = scheduledWeeks > 1 ? ` (${scheduledWeeks} weeks)` : '';
                showToast(
                    isRecurring
                        ? `✅ Scheduled ${blockCount} blocks${weeksText}!`
                        : `✅ Scheduled for ${scheduleDate} at ${scheduleTime}`,
                    'success',
                    4000
                );
                setShowScheduler(false);
                setShowConflictDialog(false);
                setConflicts([]);
            } else {
                showToast(data.error || 'Failed to schedule', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to schedule strategy', 'error');
        } finally {
            setIsScheduling(false);
        }
    };

    const toggleDay = (day: number) => {
        setSelectedDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day].sort()
        );
    };

    const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const WEEK_OPTIONS = [
        { value: 1, label: 'This Week Only' },
        { value: 2, label: '2 Weeks' },
        { value: 3, label: '3 Weeks' },
        { value: 4, label: '4 Weeks (1 Month)' }
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <GlassCard className="w-full max-w-2xl max-h-[85vh] overflow-y-auto" padding="lg">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Expert Strategy</h2>
                            <p className="text-sm text-[var(--color-text-muted)]">AI Deconstruction for "{goal.title}"</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {!strategy ? (
                    /* No Strategy - Generate CTA */
                    <div className="text-center py-12 space-y-4">
                        <Sparkles className="w-12 h-12 text-[var(--color-primary)] mx-auto animate-pulse" />
                        <h3 className="text-lg font-medium">Ready to consult the Expert?</h3>
                        <p className="text-[var(--color-text-tertiary)] max-w-sm mx-auto">
                            I will break this goal down into a daily protocol, milestone roadmap, and pre-flight checklists.
                        </p>
                        <GlassButton
                            variant="primary"
                            onClick={handleDecompose}
                            loading={isLoading}
                            className="w-full max-w-xs mx-auto"
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Strategy
                        </GlassButton>
                    </div>
                ) : (
                    /* Strategy Display */
                    <div className="space-y-6">
                        {/* Strategy One-Liner */}
                        <div className="p-4 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
                            <p className="text-[var(--color-primary)] font-medium text-center">
                                "{strategy.strategy_one_liner}"
                            </p>
                        </div>

                        {/* Routine Protocol */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> Daily Protocol
                            </h3>
                            <GlassCard padding="sm" className="bg-white/5">
                                <div className="space-y-2">
                                    {strategy.routine?.steps?.map((step: string, i: number) => (
                                        <div key={i} className="flex items-start gap-3 text-sm">
                                            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-xs mt-0.5">
                                                {i + 1}
                                            </div>
                                            <p>{step}</p>
                                        </div>
                                    ))}
                                </div>
                                {strategy.routine?.notes && (
                                    <p className="mt-3 pt-3 border-t border-white/5 text-xs text-[var(--color-text-tertiary)]">
                                        💡 {strategy.routine.notes}
                                    </p>
                                )}
                            </GlassCard>
                        </div>

                        {/* Checklists */}
                        {strategy.checklist?.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-2">
                                    <List className="w-4 h-4" /> Pre-Flight Checklist
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {strategy.checklist?.map((item: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                                            <div className="w-4 h-4 rounded border border-white/20" />
                                            <span className="text-sm">{item.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Scheduler Section */}
                        <div className="border-t border-white/10 pt-4">
                            <button
                                onClick={() => setShowScheduler(!showScheduler)}
                                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                                    <span className="font-medium">Schedule to Calendar</span>
                                </div>
                                {showScheduler ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            <AnimatePresence>
                                {showScheduler && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 space-y-4 bg-white/5 rounded-lg mt-2">
                                            {/* Date & Time Picker */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-xs uppercase text-[var(--color-text-tertiary)]">Start Date</label>
                                                    <input
                                                        type="date"
                                                        value={scheduleDate}
                                                        onChange={(e) => setScheduleDate(e.target.value)}
                                                        className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs uppercase text-[var(--color-text-tertiary)]">Start Time</label>
                                                    <input
                                                        type="time"
                                                        value={scheduleTime}
                                                        onChange={(e) => setScheduleTime(e.target.value)}
                                                        className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                                                    />
                                                </div>
                                            </div>

                                            {/* Recurring Toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm">Recurring Schedule</span>
                                                <button
                                                    onClick={() => setIsRecurring(!isRecurring)}
                                                    className={`w-12 h-6 rounded-full transition-colors ${isRecurring ? 'bg-[var(--color-primary)]' : 'bg-white/20'}`}
                                                >
                                                    <motion.div
                                                        className="w-5 h-5 bg-white rounded-full shadow-md"
                                                        animate={{ x: isRecurring ? 26 : 2 }}
                                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                    />
                                                </button>
                                            </div>

                                            {/* Recurring Options */}
                                            {isRecurring && (
                                                <>
                                                    {/* Day Selector */}
                                                    <div className="space-y-2">
                                                        <label className="text-xs uppercase text-[var(--color-text-tertiary)]">Days of Week</label>
                                                        <div className="flex gap-2">
                                                            {DAY_LABELS.map((label, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => toggleDay(idx)}
                                                                    className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${selectedDays.includes(idx)
                                                                        ? 'bg-[var(--color-primary)] text-white'
                                                                        : 'bg-white/10 text-[var(--color-text-tertiary)] hover:bg-white/20'
                                                                        }`}
                                                                >
                                                                    {label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Week Duration Selector */}
                                                    <div className="space-y-2">
                                                        <label className="text-xs uppercase text-[var(--color-text-tertiary)]">Duration</label>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {WEEK_OPTIONS.map(option => (
                                                                <button
                                                                    key={option.value}
                                                                    onClick={() => setScheduledWeeks(option.value)}
                                                                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${scheduledWeeks === option.value
                                                                        ? 'bg-[var(--color-primary)] text-white'
                                                                        : 'bg-white/10 text-[var(--color-text-tertiary)] hover:bg-white/20'
                                                                        }`}
                                                                >
                                                                    {option.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {/* Schedule Button */}
                                            <GlassButton
                                                variant="primary"
                                                className="w-full"
                                                onClick={() => handleSchedule()}
                                                loading={isScheduling}
                                            >
                                                <Calendar className="w-4 h-4 mr-2" />
                                                {isRecurring
                                                    ? `Schedule ${selectedDays.length} days × ${scheduledWeeks} week${scheduledWeeks > 1 ? 's' : ''}`
                                                    : 'Add to Calendar'}
                                            </GlassButton>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Conflict Resolution Dialog */}
                        <AnimatePresence>
                            {showConflictDialog && conflicts.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
                                    onClick={() => setShowConflictDialog(false)}
                                >
                                    <GlassCard
                                        className="w-full max-w-md"
                                        padding="lg"
                                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-full bg-[var(--color-warning)]/20 flex items-center justify-center">
                                                <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold">Scheduling Conflicts</h3>
                                                <p className="text-sm text-[var(--color-text-tertiary)]">
                                                    {conflicts.length} existing block{conflicts.length > 1 ? 's' : ''} overlap
                                                </p>
                                            </div>
                                        </div>

                                        {/* Conflict List */}
                                        <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                                            {conflicts.slice(0, 5).map((conflict, i) => (
                                                <div key={i} className="p-3 rounded-lg bg-white/5 border border-[var(--color-warning)]/20">
                                                    <p className="text-sm font-medium">{conflict.existingBlock.context}</p>
                                                    <p className="text-xs text-[var(--color-text-tertiary)]">
                                                        {conflict.date} • {conflict.existingBlock.start_time.slice(0, 5)} - {conflict.existingBlock.end_time.slice(0, 5)}
                                                    </p>
                                                </div>
                                            ))}
                                            {conflicts.length > 5 && (
                                                <p className="text-xs text-[var(--color-text-tertiary)] text-center">
                                                    +{conflicts.length - 5} more conflicts
                                                </p>
                                            )}
                                        </div>

                                        {/* Resolution Options */}
                                        <div className="space-y-2">
                                            <GlassButton
                                                variant="danger"
                                                className="w-full"
                                                onClick={() => handleSchedule(false, true)}
                                                loading={isScheduling}
                                            >
                                                <Replace className="w-4 h-4 mr-2" />
                                                Replace Existing Blocks
                                            </GlassButton>
                                            <GlassButton
                                                variant="ghost"
                                                className="w-full"
                                                onClick={() => handleSchedule(true, false)}
                                                loading={isScheduling}
                                            >
                                                <SkipForward className="w-4 h-4 mr-2" />
                                                Skip Conflicts
                                            </GlassButton>
                                            <button
                                                onClick={() => setShowConflictDialog(false)}
                                                className="w-full py-2 text-sm text-[var(--color-text-tertiary)] hover:text-white transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </GlassCard>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Footer Actions */}
                        <div className="pt-4 flex gap-3 border-t border-white/10">
                            <GlassButton
                                variant="primary"
                                className="flex-1"
                                onClick={() => {
                                    showToast('Strategy saved to goal!', 'success');
                                    onClose();
                                }}
                            >
                                <Check className="w-4 h-4 mr-2" />
                                Done
                            </GlassButton>
                            <GlassButton
                                variant="ghost"
                                onClick={() => {
                                    setStrategy(null);
                                    showToast('Regenerating strategy...', 'info');
                                }}
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Regenerate
                            </GlassButton>
                        </div>
                    </div>
                )}
            </GlassCard>
        </div>
    );
}
