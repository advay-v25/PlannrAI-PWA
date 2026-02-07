'use client';

import { useEffect, useState, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { useToast } from '@/components/ui/toast';
import { WeekPlanner, PlanWeekFAB } from '@/components/week-planner';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Check, Minus, X, Sparkles, Calendar as CalendarIcon, AlertTriangle, ZapOff, Plus, Trash2, Anchor, Repeat, Brain, ListChecks, Square, CheckSquare, Lock, Loader2 } from 'lucide-react';
import type { ScheduleBlock, BlockStatus, Goal } from '@/types/database';
import { useScheduleWatchdog } from '@/hooks/use-schedule-watchdog';
import { useDailyLogStore, useUserStore } from '@/stores';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { DailyGrid } from '@/components/calendar/daily-grid';

const STATUS_CONFIG: Record<BlockStatus, { icon: React.ReactNode; color: string; label: string }> = {
    planned: { icon: null, color: 'var(--color-text-muted)', label: 'Planned' },
    done: { icon: <Check className="w-3 h-3" />, color: 'var(--color-success)', label: 'Done' },
    partial: { icon: <Minus className="w-3 h-3" />, color: 'var(--color-warning)', label: 'Partial' },
    missed: { icon: <X className="w-3 h-3" />, color: 'var(--color-muted)', label: 'Missed' },
};

function CalendarContent() {
    const supabase = createClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showToast } = useToast();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [blocks, setBlocks] = useState<(ScheduleBlock & { goal?: Goal })[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showWeekPlanner, setShowWeekPlanner] = useState(false);
    const [editingBlock, setEditingBlock] = useState<(ScheduleBlock & { goal?: Goal }) | null>(null);
    const [creatingBlock, setCreatingBlock] = useState<{ start_time: string; end_time: string; context: string } | null>(null);
    const [creatingAnchor, setCreatingAnchor] = useState<{ title: string; start_time: string; end_time: string; days: number[] } | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);

    // Watchdog Integration
    const { profile } = useUserStore();
    const { todayLog } = useDailyLogStore();
    const { conflicts, hasConflicts } = useScheduleWatchdog({
        blocks,
        energyLevel: isSameDay(selectedDate, new Date()) ? todayLog?.energy_level : undefined,
        lowEnergyMode: profile?.low_energy_mode
    });

    const isBlockImmutable = (block: ScheduleBlock) => {
        return block.block_type === 'anchor' || block.block_type === 'sleep' || block.block_type === 'wind_down';
    };

    const handleUpdateBlock = async () => {
        if (!editingBlock) return;
        try {
            const { block } = await apiClient.schedule.updateBlock(editingBlock.id, {
                start_time: editingBlock.start_time,
                end_time: editingBlock.end_time,
                context: editingBlock.context,
                checklist: editingBlock.checklist || null
            });
            setBlocks(prev => prev.map(b => b.id === block.id ? { ...block, goal: editingBlock.goal } : b));
            setEditingBlock(null);
            showToast('✅ Block updated', 'success');
        } catch (e: any) {
            showToast(e.data?.error || 'Failed to update block', 'error');
        }
    };

    const handleDeleteBlock = async () => {
        if (!editingBlock) return;
        try {
            await apiClient.schedule.deleteBlock(editingBlock.id);
            setBlocks(prev => prev.filter(b => b.id !== editingBlock.id));
            setEditingBlock(null);
            showToast('🗑️ Block deleted', 'info');
        } catch (e: any) {
            showToast(e.data?.error || 'Failed to delete block', 'error');
        }
    };

    const handleCreateBlock = async () => {
        if (!creatingBlock) return;
        try {
            const { block } = await apiClient.schedule.createBlock({
                date: format(selectedDate, 'yyyy-MM-dd'),
                start_time: creatingBlock.start_time,
                end_time: creatingBlock.end_time,
                context: creatingBlock.context || 'New Task',
                goal_id: null
            });
            setBlocks(prev => [...prev, block as any].sort((a, b) => a.start_time.localeCompare(b.start_time)));
            showToast('✅ Block added', 'success');
            setCreatingBlock(null);
        } catch (e: any) {
            showToast(e.data?.error || 'Failed to create block', 'error');
        }
    };

    const handleCreateAnchor = async () => {
        if (!creatingAnchor || !creatingAnchor.title.trim()) {
            showToast('Please enter a title', 'error');
            return;
        }
        try {
            const { error } = await supabase.from('commitments').insert({
                title: creatingAnchor.title,
                start_time: creatingAnchor.start_time,
                end_time: creatingAnchor.end_time,
                days_of_week: creatingAnchor.days,
                is_active: true
            });
            if (error) throw error;
            showToast('⚓ Anchor set! Optimizing schedule...', 'success');
            await handleOptimizeDay();
            setCreatingAnchor(null);
        } catch (e) {
            console.error(e);
            showToast('Failed to create anchor', 'error');
        }
    };

    useEffect(() => {
        const handleRefresh = () => {
            loadData();
        };
        window.addEventListener('calendar-refresh', handleRefresh);
        return () => window.removeEventListener('calendar-refresh', handleRefresh);
    }, [selectedDate, weekStart]);

    async function loadData() {
        setIsLoading(true);
        try {
            // Fetch goals (still via supabase for now, could be simplified)
            const { data: goalsData } = await supabase.from('goals').select('*');
            if (goalsData) setGoals(goalsData);

            // Fetch blocks for the selected day directly from API
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const { blocks: blocksData } = await apiClient.schedule.list(dateStr, dateStr);
            setBlocks(blocksData);
        } catch (e) {
            console.error(e);
            showToast('Failed to load schedule', 'error');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [selectedDate, weekStart, searchParams]);

    const handleStatusChange = async (blockId: string, newStatus: BlockStatus) => {
        try {
            const { block } = await apiClient.schedule.updateBlock(blockId, { status: newStatus });
            setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, status: newStatus } : b)));

            const statusLabels: Record<BlockStatus, string> = {
                done: '✅ Completed!',
                partial: '🟡 Partial progress',
                missed: '❌ Marked as missed',
                planned: '📅 Reset to planned'
            };
            showToast(statusLabels[newStatus], newStatus === 'done' ? 'success' : 'info');
        } catch (e: any) {
            showToast(e.data?.error || 'Failed to update status', 'error');
        }
    };

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const navigateWeek = (direction: 'prev' | 'next') => {
        const newWeekStart = addDays(weekStart, direction === 'next' ? 7 : -7);
        setWeekStart(newWeekStart);
        setSelectedDate(newWeekStart);
    };

    const handlePlanApplied = () => {
        setShowWeekPlanner(false);
        loadData();
    };

    const handleOptimizeDay = async () => {
        setIsOptimizing(true);
        showToast('✨ Optimizing your day...', 'info');
        try {
            const { data } = await apiClient.post<any>('/api/ai/optimize-day', {
                date: format(selectedDate, 'yyyy-MM-dd'),
                blocks,
                energyLevel: todayLog?.energy_level || 3
            });
            setBlocks(data.optimizedBlocks.sort((a: { start_time: string }, b: { start_time: string }) => a.start_time.localeCompare(b.start_time)));
            showToast('🚀 Day optimized!', 'success');
        } catch (error: any) {
            console.error(error);
            showToast(error.message || 'Optimization failed', 'error');
        } finally {
            setIsOptimizing(false);
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* ... (Header & Day Selector remain same) */}

            {/* Timeline View -> Replaced with DailyGrid */}
            <div className="space-y-3">
                <h2 className="text-sm font-medium text-[var(--text-secondary)]">{format(selectedDate, 'EEEE, MMMM d')}</h2>
                {isLoading ? (
                    <div className="h-[600px] rounded-3xl bg-white/5 animate-pulse" />
                ) : (
                    <DailyGrid
                        date={selectedDate}
                        blocks={blocks}
                        onBlockClick={(block) => !isBlockImmutable(block) && setEditingBlock(block)}
                        onSlotClick={(start, end) => setCreatingBlock({ start_time: start, end_time: end, context: '' })}
                        onStatusChange={handleStatusChange}
                    />
                )}

                {/* Quick Add Buttons */}
                <div className="flex gap-3 mt-4">
                    <GlassButton
                        variant="ghost"
                        className="flex-1"
                        onClick={() => setCreatingBlock({ start_time: '09:00', end_time: '10:00', context: '' })}
                    >
                        <Plus className="w-4 h-4" />
                        Add Block
                    </GlassButton>
                    <GlassButton
                        variant="ghost"
                        className="flex-1"
                        onClick={() => setCreatingAnchor({ title: '', start_time: '09:00', end_time: '17:00', days: [1, 2, 3, 4, 5] })}
                    >
                        <Anchor className="w-4 h-4" />
                        Add Anchor
                    </GlassButton>
                </div>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {showWeekPlanner && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowWeekPlanner(false)}>
                        <div className="w-full max-w-lg" onClick={e => e.stopPropagation()}><WeekPlanner onClose={() => setShowWeekPlanner(false)} onApply={handlePlanApplied} /></div>
                    </div>
                )}
                {editingBlock && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setEditingBlock(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md"
                        >
                            <GlassCard padding="lg" className="space-y-6">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold">Edit Entry</h3>
                                        {editingBlock.block_type && editingBlock.block_type !== 'goal' && (
                                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] mt-1">
                                                {editingBlock.block_type === 'routine' && <Repeat className="w-3 h-3" />}
                                                {editingBlock.block_type === 'anchor' && <Anchor className="w-3 h-3" />}
                                                {editingBlock.block_type}
                                            </span>
                                        )}
                                    </div>
                                    <button onClick={() => setEditingBlock(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                        <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                                    </button>
                                </div>

                                {/* Title/Context Input */}
                                <GlassInput
                                    label="Title"
                                    value={editingBlock.context || ''}
                                    onChange={e => setEditingBlock({ ...editingBlock, context: e.target.value })}
                                    placeholder="What are you doing?"
                                />

                                {/* Time Inputs */}
                                <div className="grid grid-cols-2 gap-4">
                                    <GlassInput
                                        label="Start Time"
                                        type="time"
                                        value={editingBlock.start_time?.slice(0, 5) || ''}
                                        onChange={e => setEditingBlock({ ...editingBlock, start_time: e.target.value + ':00' })}
                                    />
                                    <GlassInput
                                        label="End Time"
                                        type="time"
                                        value={editingBlock.end_time?.slice(0, 5) || ''}
                                        onChange={e => setEditingBlock({ ...editingBlock, end_time: e.target.value + ':00' })}
                                    />
                                </div>

                                {/* Goal Badge (if linked) */}
                                {editingBlock.goal && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
                                        <Brain className="w-4 h-4 text-[var(--color-primary)]" />
                                        <span className="text-sm font-medium">Linked to: {editingBlock.goal.title}</span>
                                    </div>
                                )}

                                {/* Checklist Section */}
                                {editingBlock.checklist && editingBlock.checklist.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs uppercase text-[var(--text-tertiary)] flex items-center gap-1">
                                                <ListChecks className="w-3 h-3" />
                                                Checklist ({editingBlock.checklist.filter((c: any) => c.completed).length}/{editingBlock.checklist.length})
                                            </label>
                                        </div>
                                        <div className="space-y-1 max-h-40 overflow-y-auto">
                                            {editingBlock.checklist.map((item: any, idx: number) => (
                                                <button
                                                    key={item.id || idx}
                                                    onClick={() => {
                                                        const updatedChecklist = (editingBlock.checklist || []).map((c: any, i: number) =>
                                                            i === idx ? { ...c, completed: !c.completed } : c
                                                        );
                                                        setEditingBlock({ ...editingBlock, checklist: updatedChecklist });
                                                    }}
                                                    className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-white/5 text-left ${item.completed ? 'opacity-60' : ''
                                                        }`}
                                                >
                                                    {item.completed ? (
                                                        <CheckSquare className="w-4 h-4 text-[var(--color-success)] flex-shrink-0" />
                                                    ) : (
                                                        <Square className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                                                    )}
                                                    <span className={`text-sm ${item.completed ? 'line-through text-[var(--text-tertiary)]' : ''}`}>
                                                        {item.text}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <GlassButton variant="danger" onClick={handleDeleteBlock} className="px-4">
                                        <Trash2 className="w-4 h-4" />
                                    </GlassButton>
                                    <GlassButton className="flex-1" variant="primary" onClick={handleUpdateBlock}>
                                        Save Changes
                                    </GlassButton>
                                </div>
                            </GlassCard>
                        </motion.div>
                    </div>
                )}

                {/* Create Block Modal */}
                {creatingBlock && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setCreatingBlock(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md"
                        >
                            <GlassCard padding="lg" className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold">New Block</h3>
                                        <p className="text-xs text-[var(--text-tertiary)]">{format(selectedDate, 'EEEE, MMMM d')}</p>
                                    </div>
                                    <button onClick={() => setCreatingBlock(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                        <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                                    </button>
                                </div>

                                <GlassInput
                                    label="What are you doing?"
                                    value={creatingBlock.context}
                                    onChange={e => setCreatingBlock({ ...creatingBlock, context: e.target.value })}
                                    placeholder="e.g. Deep Work, Exercise, Reading..."
                                    autoFocus
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <GlassInput
                                        label="Start Time"
                                        type="time"
                                        value={creatingBlock.start_time}
                                        onChange={e => setCreatingBlock({ ...creatingBlock, start_time: e.target.value })}
                                    />
                                    <GlassInput
                                        label="End Time"
                                        type="time"
                                        value={creatingBlock.end_time}
                                        onChange={e => setCreatingBlock({ ...creatingBlock, end_time: e.target.value })}
                                    />
                                </div>

                                <GlassButton variant="primary" className="w-full" onClick={handleCreateBlock}>
                                    <Plus className="w-4 h-4" />
                                    Add Block
                                </GlassButton>
                            </GlassCard>
                        </motion.div>
                    </div>
                )}

                {/* Create Anchor Modal */}
                {creatingAnchor && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setCreatingAnchor(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md"
                        >
                            <GlassCard padding="lg" className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Anchor className="w-5 h-5 text-[var(--color-warning)]" />
                                        <h3 className="text-xl font-bold">New Anchor</h3>
                                    </div>
                                    <button onClick={() => setCreatingAnchor(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                        <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                                    </button>
                                </div>
                                <p className="text-sm text-[var(--text-secondary)]">
                                    Anchors are fixed, recurring time blocks where no other tasks can be scheduled.
                                </p>

                                <GlassInput
                                    label="Title"
                                    value={creatingAnchor.title}
                                    onChange={e => setCreatingAnchor({ ...creatingAnchor, title: e.target.value })}
                                    placeholder="e.g. Work, School, Meeting..."
                                    autoFocus
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <GlassInput
                                        label="Start Time"
                                        type="time"
                                        value={creatingAnchor.start_time}
                                        onChange={e => setCreatingAnchor({ ...creatingAnchor, start_time: e.target.value })}
                                    />
                                    <GlassInput
                                        label="End Time"
                                        type="time"
                                        value={creatingAnchor.end_time}
                                        onChange={e => setCreatingAnchor({ ...creatingAnchor, end_time: e.target.value })}
                                    />
                                </div>

                                {/* Day Selector */}
                                <div className="space-y-2">
                                    <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold">Repeats On</label>
                                    <div className="flex gap-2 justify-between">
                                        {[
                                            { id: 1, label: 'M' },
                                            { id: 2, label: 'T' },
                                            { id: 3, label: 'W' },
                                            { id: 4, label: 'T' },
                                            { id: 5, label: 'F' },
                                            { id: 6, label: 'S' },
                                            { id: 0, label: 'S' },
                                        ].map(day => {
                                            const isSelected = creatingAnchor.days.includes(day.id);
                                            return (
                                                <button
                                                    key={day.id}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setCreatingAnchor({ ...creatingAnchor, days: creatingAnchor.days.filter(d => d !== day.id) });
                                                        } else {
                                                            setCreatingAnchor({ ...creatingAnchor, days: [...creatingAnchor.days, day.id] });
                                                        }
                                                    }}
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${isSelected
                                                        ? 'bg-[var(--color-warning)] text-black shadow-lg shadow-[var(--color-warning)]/20'
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
                                    className="w-full"
                                    onClick={handleCreateAnchor}
                                    disabled={!creatingAnchor.title.trim() || creatingAnchor.days.length === 0}
                                >
                                    <Anchor className="w-4 h-4" />
                                    Set Anchor
                                </GlassButton>
                            </GlassCard>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <PlanWeekFAB onClick={() => setShowWeekPlanner(true)} />
        </div>
    );
}

export default function CalendarPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        }>
            <CalendarContent />
        </Suspense>
    );
}
