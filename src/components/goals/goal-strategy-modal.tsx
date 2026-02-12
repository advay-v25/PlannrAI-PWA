'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { X, Sparkles, Check, Calendar, List, Clock, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Replace, SkipForward } from 'lucide-react';
import type { Goal } from '@/types/database';
import type { Patch, PatchOp } from '@/lib/ai/schemas';

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

    // Conflict state (disabled for client-side patch generation for now)
    const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
    const [showConflictDialog, setShowConflictDialog] = useState(false);

    // Sync strategy when goal changes
    useEffect(() => {
        setStrategy(goal.ai_strategy || null);
    }, [goal.ai_strategy]);

    const handleDecompose = async () => {
        setIsLoading(true);
        try {
            const aiData = await apiClient.ai.execute({
                channel: 'goal_strategy',
                input: `Decompose goal: ${goal.title}`,
                context: {
                    goal_id: goal.id,
                    goal_title: goal.title,
                    goal_category: goal.category,
                    minutes_per_day: goal.minutes_per_day,
                    skill_level: 'Beginner'
                }
            });

            if (aiData.options && aiData.options.length > 0) {
                const option = aiData.options[0];
                let plan = null;

                if (option.patch?.ops) {
                    const updateOp = option.patch.ops.find((op: any) => op.op === 'update_goal');
                    if (updateOp && 'fields' in updateOp && updateOp.fields.ai_strategy) {
                        plan = updateOp.fields.ai_strategy;
                    }
                }

                if (plan) {
                    setStrategy(plan);
                    showToast('Strategy generated!', 'success', 3000);
                    onStrategyGenerated?.(plan);
                    // Also execute the patch to save it to DB
                    await apiClient.patch.apply(option.patch, 'goal_strategy');
                } else {
                    console.warn("AI Response missing strategy patch", aiData);
                    showToast('AI format mismatch', 'error');
                }
            } else {
                showToast(aiData.refusal?.reason || 'Failed to generate strategy', 'error');
            }
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Failed to generate strategy', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const generateScheduleOps = (): PatchOp[] => {
        const ops: PatchOp[] = [];
        const startDate = new Date(scheduleDate);
        const durationMins = goal.minutes_per_day || 60;

        // Calculate total days to schedule
        const totalDays = isRecurring ? scheduledWeeks * 7 : 1;

        for (let i = 0; i < totalDays; i++) {
            const current = new Date(startDate);
            current.setDate(startDate.getDate() + i);
            const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon...

            // If not recurring, we just schedule for start date (loop runs once)
            // If recurring, check if day matches selectedDays
            if (!isRecurring || selectedDays.includes(dayOfWeek)) {
                // Calculate Start/End ISO strings
                const yyyy = current.getFullYear();
                const mm = String(current.getMonth() + 1).padStart(2, '0');
                const dd = String(current.getDate()).padStart(2, '0');
                const dateStr = `${yyyy}-${mm}-${dd}`;

                const startIso = `${dateStr}T${scheduleTime}:00`;
                const endDate = new Date(new Date(startIso).getTime() + durationMins * 60000);
                // Simple formatting for end time ISO
                const endIso = endDate.toISOString().replace(/\.\d{3}Z$/, ''); // Local time simplified usage
                // Wait, ISO string from Date is UTC. We need literal string construction to avoid timezone mess if we treat inputs as local.
                // Better approach:
                // Construct Date object from input date+time (assuming local browser context)
                // Then convert to ISO? Supabase expects ISO with Offset or UTC.
                // To be safe and simple: use the 'start_time' and 'end_time' fields in payload as full ISO strings
                // calculated carefully.

                // Let's assume user inputs are Local Time.
                const startD = new Date(`${dateStr}T${scheduleTime}:00`);
                const endD = new Date(startD.getTime() + durationMins * 60000);

                ops.push({
                    op: 'create_event',
                    payload: {
                        title: goal.title,
                        start_time: startD.toISOString(),
                        end_time: endD.toISOString(),
                        block_type: 'goal',
                        goal_id: goal.id
                    }
                });
            }
        }
        return ops;
    };


    const handleSchedule = async (skipConflicts = false, replaceConflicts = false) => {
        if (!strategy) return;
        setIsScheduling(true);

        try {
            const ops = generateScheduleOps();

            if (ops.length === 0) {
                showToast('No days selected to schedule', 'error');
                setIsScheduling(false);
                return;
            }

            const patch: Patch = {
                undoable: true,
                ops: ops
            };

            await apiClient.patch.apply(patch, 'goal_schedule');

            const blockCount = ops.length;
            const weeksText = scheduledWeeks > 1 ? ` (${scheduledWeeks} weeks)` : '';
            showToast(
                isRecurring
                    ? `✅ Scheduled ${blockCount} blocks${weeksText}!`
                    : `✅ Scheduled for ${scheduleDate} at ${scheduleTime}`,
                'success',
                4000
            );
            setShowScheduler(false);
            setConflicts([]);

        } catch (e: any) {
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
                            className="w-full max-w-xs mx-auto"
                        >
                            {isLoading ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Sparkles className="w-4 h-4 mr-2" />
                            )}
                            {isLoading ? 'Synthesizing...' : 'Generate Strategy'}
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
                                                disabled={isScheduling}
                                            >
                                                {isScheduling ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
                                                {isScheduling ? 'Scheduling...' : (isRecurring
                                                    ? `Schedule ${selectedDays.length} days × ${scheduledWeeks} week${scheduledWeeks > 1 ? 's' : ''}`
                                                    : 'Add to Calendar')}
                                            </GlassButton>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

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
