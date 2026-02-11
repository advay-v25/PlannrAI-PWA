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
import { CommitmentModal } from '@/components/goals/commitment-modal';
import { DailyGrid } from '@/components/calendar/daily-grid';
import { ConflictResolutionModal } from '@/components/calendar/conflict-resolution-modal';
import { ConflictResolver, ResolutionOption } from '@/lib/calendar/conflict-resolver';

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
    const [creatingAnchor, setCreatingAnchor] = useState<any>(null);
    const [aiReasoning, setAiReasoning] = useState<string | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);

    // Conflict Resolution State
    const [conflictOptions, setConflictOptions] = useState<ResolutionOption[] | null>(null);
    const [pendingAction, setPendingAction] = useState<{ type: 'move' | 'create', payload: any } | null>(null); // Refactored for B2

    // Watchdog Integration
    const { profile } = useUserStore();
    const { todayLog } = useDailyLogStore();
    const { conflicts, hasConflicts } = useScheduleWatchdog({
        blocks,
        energyLevel: isSameDay(selectedDate, new Date()) ? todayLog?.energy_level : undefined,
        lowEnergyMode: profile?.low_energy_mode || undefined
    });

    const isBlockImmutable = (block: ScheduleBlock) => {
        return block.block_type === 'anchor' || block.block_type === 'sleep' || block.block_type === 'wind_down';
    };

    const handleUpdateBlock = async () => {
        if (!editingBlock) return;
        try {
            const original = blocks.find(b => b.id === editingBlock.id);
            const { block } = await apiClient.schedule.updateBlock(editingBlock.id, {
                start_time: editingBlock.start_time,
                end_time: editingBlock.end_time,
                context: editingBlock.context,
                checklist: editingBlock.checklist || undefined
            });

            // Resonance Signal (Reschedule)
            if (original && (original.start_time !== block.start_time || original.end_time !== block.end_time)) {
                apiClient.behavior.logSignal('reschedule', {
                    block_id: block.id,
                    title: block.title || block.context || undefined,
                    from_time: original.start_time,
                    to_time: block.start_time
                });
            }

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

            // Resonance Signal
            apiClient.behavior.logSignal('accept_suggestion', {
                block_id: (block as any).id,
                title: (block as any).context,
                context: 'Manual Block Creation'
            });

            showToast('✅ Block added', 'success');
            setCreatingBlock(null);
        } catch (e: any) {
            if (e.status === 409 && e.data?.conflict) {
                setConflictOptions(e.data.options);
                setPendingAction({ type: 'create', payload: creatingBlock });
                setCreatingBlock(null);
                return;
            }
            showToast(e.data?.error || e.message || 'Failed to create block', 'error');
        }
    };

    const handleCreateAnchor = async () => {
        if (!creatingAnchor || !creatingAnchor.title.trim()) {
            showToast('Please enter a title', 'error');
            return;
        }

        setIsLoading(true); // Show loading during creation + optimization
        try {
            await apiClient.anchors.create({
                title: creatingAnchor.title,
                start_time: creatingAnchor.start_time,
                end_time: creatingAnchor.end_time,
                days_of_week: creatingAnchor.days
            });

            showToast('⚓ Anchor set! Aligning schedule...', 'success');

            // Re-fetch data and optimize
            await handleOptimizeDay();
            setCreatingAnchor(null);
        } catch (e: any) {
            console.error('Anchor Creation Error:', e);
            showToast(e.data?.message || e.message || 'Failed to create anchor', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const handleRefresh = () => {
            loadData();
        };
        window.addEventListener('calendar-refresh', handleRefresh);
        return () => window.removeEventListener('calendar-refresh', handleRefresh);
    }, [selectedDate, weekStart]);

    const [anchors, setAnchors] = useState<any[]>([]);

    async function loadData() {
        setIsLoading(true);
        try {
            // Fetch goals
            const { data: goalsData } = await supabase.from('goals').select('*');
            if (goalsData) setGoals(goalsData);

            // Fetch Commitments (Anchors)
            const { data: anchorsData } = await supabase.from('commitments').select('*').eq('is_active', true);
            if (anchorsData) setAnchors(anchorsData);

            // Fetch blocks
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

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const navigateWeek = (direction: 'next' | 'prev') => {
        setWeekStart(current => addDays(current, direction === 'next' ? 7 : -7));
    };

    const handleStatusChange = async (blockId: string, newStatus: BlockStatus) => {
        try {
            setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, status: newStatus } : b));
            await apiClient.schedule.updateStatus(blockId, newStatus);

            // Log signal
            apiClient.behavior.logSignal('complete', {
                block_id: blockId,
                status: newStatus
            });
        } catch (e) {
            showToast('Failed to update status', 'error');
            // Revert on error
            loadData();
        }
    };

    const handlePlanApplied = async () => {
        await loadData();
        setShowWeekPlanner(false);
        showToast('Week plan applied successfully', 'success');
    };

    const handleOptimizeDay = async () => {
        setIsOptimizing(true);
        showToast('✨ Optimizing your day...', 'info');
        try {
            // 1. Prepare Context
            const context = {
                date: format(selectedDate, 'yyyy-MM-dd'),
                blocks: blocks.map(b => ({
                    ...b,
                    is_fixed: isBlockImmutable(b) // Helper for AI to know what not to touch
                })),
                goals: goals.filter(g => g.status === 'active'),
                anchors: anchors, // Send full anchors list so AI can place them
                user_energy: todayLog?.energy_level || 3,
                preferences: {
                    low_energy_mode: profile?.low_energy_mode
                }
            };

            // 2. Call AI Gateway
            const response = await apiClient.post<any>('/api/ai/execute', {
                channel: 'calendar',
                input: "Optimize my schedule for today. Ensure all anchors are present and fit goals around them according to my energy.",
                context,
                limits: { max_options: 1 }
            });

            // 3. Process Response
            const aiData = response.data || response; // Handle wrapped/unwrapped

            if (aiData.options?.[0]?.patch?.ops) {
                const ops = aiData.options[0].patch.ops;

                // Convert ops to blocks
                const newBlocks: any[] = [];

                // We trust the AI to return the Full Day schedule in ops if we asked for optimization
                // Or we can treat `create_event` as additions. 
                // Given the 'sync' nature, we reconstruct the day.

                ops.forEach((op: any) => {
                    if (op.op === 'create_event') {
                        newBlocks.push(op.payload);
                    }
                    // Handle move/update if needed, but for full opt usually it's create_event list
                });

                if (newBlocks.length > 0) {
                    // 4. Apply Updates
                    const result = await apiClient.schedule.sync(
                        format(selectedDate, 'yyyy-MM-dd'),
                        newBlocks
                    );

                    setBlocks(result.blocks.sort((a, b) => a.start_time.localeCompare(b.start_time)));
                    setAiReasoning(aiData.summary);
                    showToast('🚀 Day optimized!', 'success');
                } else {
                    showToast('AI suggested no changes.', 'info');
                }
            } else {
                showToast('No valid plan generated', 'warning');
            }
        } catch (error: any) {
            console.error(error);
            showToast(error.message || 'Optimization failed', 'error');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleResolveConflict = async (opt: ResolutionOption) => {
        if (!pendingAction) return;

        setIsOptimizing(true);
        try {
            if (opt.id === 'cancel') {
                setConflictOptions(null);
                setPendingAction(null);
                return;
            }

            // Apply patch from resolution
            await apiClient.post('/api/calendar/apply-patch', {
                patch: opt.patch,
                range: {
                    start: format(selectedDate, 'yyyy-MM-dd'),
                    end: format(selectedDate, 'yyyy-MM-dd')
                }
            });

            showToast('Conflict resolved', 'success');
            setConflictOptions(null);
            setPendingAction(null);
            loadData();
        } catch (e) {
            showToast('Failed to resolve conflict', 'error');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleBlockMove = async (blockId: string, newStart: string, newEnd: string) => {
        const originalBlock = blocks.find(b => b.id === blockId);
        if (!originalBlock) return;

        // Optimistic update
        const originalBlocks = [...blocks];
        setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, start_time: newStart, end_time: newEnd } : b));

        try {
            await apiClient.schedule.moveBlock(blockId, format(selectedDate, 'yyyy-MM-dd'), newStart, newEnd);
            showToast('✅ Block moved', 'success');
        } catch (e: any) {
            setBlocks(originalBlocks); // Revert

            if (e.status === 409 && e.data?.conflict) {
                setConflictOptions(e.data.options);
                setPendingAction({ type: 'move', payload: { id: blockId, start: newStart, end: newEnd } });
                return;
            }

            showToast(e.data?.error || e.message || 'Move failed', 'error');
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        High-resolution visibility of your focus flow.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <GlassButton
                        variant="primary"
                        className="shadow-lg shadow-primary/20 bg-gradient-to-r from-primary to-blue-600 border-none group px-6"
                        onClick={handleOptimizeDay}
                        disabled={isOptimizing}
                    >
                        {isOptimizing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                        )}
                        {isOptimizing ? 'Aligning...' : 'Optimize Day'}
                    </GlassButton>
                </div>
            </div>

            {/* Day Selector & Navigation */}
            <GlassCard padding="none" className="overflow-hidden border-white/5">
                <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigateWeek('prev')}
                            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-[var(--text-tertiary)]" />
                        </button>
                        <h3 className="text-sm font-bold tracking-widest uppercase">
                            {format(weekStart, 'MMMM yyyy')}
                        </h3>
                        <button
                            onClick={() => navigateWeek('next')}
                            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)]" />
                        </button>
                    </div>
                    <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setSelectedDate(new Date());
                            setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
                        }}
                    >
                        Today
                    </GlassButton>
                </div>

                <div className="p-2 flex justify-between gap-1 overflow-x-auto no-scrollbar">
                    {weekDays.map((day) => {
                        const isSelected = isSameDay(day, selectedDate);
                        const isToday = isSameDay(day, new Date());
                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => setSelectedDate(day)}
                                className={`flex-1 min-w-[60px] flex flex-col items-center py-3 rounded-2xl transition-all ${isSelected
                                    ? 'bg-primary text-white shadow-xl shadow-primary/30 scale-105'
                                    : 'hover:bg-white/5 text-[var(--text-tertiary)]'
                                    }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-60">
                                    {format(day, 'EEE')}
                                </span>
                                <span className={`text-sm font-bold ${isToday && !isSelected ? 'text-primary' : ''}`}>
                                    {format(day, 'd')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </GlassCard>

            {/* Timeline View */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            {format(selectedDate, 'EEEE, MMMM d')}
                        </h2>
                        {hasConflicts && (
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-bold tracking-widest uppercase animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                Conflicts Detected
                            </div>
                        )}
                    </div>

                    {/* AI Reasoning Panel */}
                    <AnimatePresence>
                        {aiReasoning && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <GlassCard className="border-primary/20 bg-primary/5 p-4 mb-4 relative overflow-hidden group">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <Sparkles className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                                                Flow Strategy Analysis
                                                <span className="h-px grow bg-primary/20" />
                                            </p>
                                            <p className="text-sm text-[var(--text-secondary)] mt-1.5 italic leading-relaxed">
                                                "{aiReasoning}"
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setAiReasoning(null)}
                                            className="p-1 rounded-md hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-4 h-4 text-[var(--text-tertiary)]" />
                                        </button>
                                    </div>
                                    <div className="absolute top-0 right-0 p-1">
                                        <div className="text-[8px] font-bold text-primary/30 uppercase tracking-[0.2em] -rotate-90 origin-top-right mr-[-2px] mt-8">SUPER_INTELLIGENCE</div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {isLoading ? (
                        <div className="h-[600px] rounded-[2.5rem] bg-white/5 animate-pulse" />
                    ) : (
                        <DailyGrid
                            date={selectedDate}
                            blocks={blocks}
                            onBlockClick={(block) => !isBlockImmutable(block) && setEditingBlock(block)}
                            onSlotClick={(start, end) => setCreatingBlock({ start_time: start, end_time: end, context: '' })}
                            onStatusChange={handleStatusChange}
                            onBlockMove={handleBlockMove}
                        />
                    )}
                </div>

                {/* Sidebar Actions */}
                <div className="space-y-6">
                    <GlassCard padding="lg" className="space-y-4 border-white/5">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Quick Actions</h4>
                        <div className="flex flex-col gap-3">
                            <GlassButton
                                variant="ghost"
                                className="justify-start gap-3 w-full border-white/5 hover:bg-white/5"
                                onClick={() => setCreatingBlock({ start_time: '09:00', end_time: '10:00', context: '' })}
                            >
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                    <Plus className="w-4 h-4 text-blue-500" />
                                </div>
                                <span className="text-sm">Manual Task</span>
                            </GlassButton>
                            <GlassButton
                                variant="ghost"
                                className="justify-start gap-3 w-full border-white/5 hover:bg-white/5"
                                onClick={() => setCreatingAnchor({ title: '', start_time: '09:00', end_time: '17:00', days: [1, 2, 3, 4, 5] })}
                            >
                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                    <Anchor className="w-4 h-4 text-amber-500" />
                                </div>
                                <span className="text-sm">Set Anchor</span>
                            </GlassButton>
                            <GlassButton
                                variant="ghost"
                                className="justify-start gap-3 w-full border-white/5 hover:bg-white/5"
                                onClick={() => setShowWeekPlanner(true)}
                            >
                                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-purple-500" />
                                </div>
                                <span className="text-sm">Week Planner</span>
                            </GlassButton>
                        </div>
                    </GlassCard>

                    {/* Low Energy Mode Alert */}
                    {profile?.low_energy_mode && isSameDay(selectedDate, new Date()) && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <GlassCard className="border-blue-500/20 bg-blue-500/5 p-4 flex gap-3">
                                <ZapOff className="w-5 h-5 text-blue-400 shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Low Energy Mode</p>
                                    <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Prioritizing rest and high-leverage tasks only.</p>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {conflictOptions && (
                    <ConflictResolutionModal
                        options={conflictOptions}
                        onSelect={handleResolveConflict}
                        onCancel={() => {
                            setConflictOptions(null);
                            setPendingAction(null);
                        }}
                    />
                )}
                {showWeekPlanner && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowWeekPlanner(false)}>
                        <div className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
                            <WeekPlanner
                                onClose={() => setShowWeekPlanner(false)}
                                onApply={handlePlanApplied}
                                context={{
                                    goals: goals.filter(g => g.status === 'active'),
                                    anchors: anchors,
                                    user_profile: { energy_level: todayLog?.energy_level }
                                }}
                            />
                        </div>
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
                                {editingBlock.checklist && (editingBlock.checklist as any[]).length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase text-[var(--text-tertiary)] font-bold flex items-center gap-1">
                                            <ListChecks className="w-3 h-3" /> Step-by-Step
                                        </label>
                                        <div className="space-y-1">
                                            {(editingBlock.checklist as any[]).map((item: any) => (
                                                <div key={item.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                                    {item.completed ? <CheckSquare className="w-3 h-3 text-[var(--color-primary)]" /> : <Square className="w-3 h-3 opacity-30" />}
                                                    <span>{item.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <GlassButton
                                        variant="ghost"
                                        className="grow text-red-400 hover:bg-red-500/10 hover:text-red-300 border-white/5"
                                        onClick={handleDeleteBlock}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </GlassButton>
                                    <GlassButton
                                        variant="primary"
                                        className="grow"
                                        onClick={handleUpdateBlock}
                                    >
                                        <Check className="w-4 h-4 mr-2" />
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
                    <CommitmentModal
                        onClose={() => setCreatingAnchor(null)}
                        onSuccess={async () => {
                            showToast('⚓ Anchor set! Aligning schedule...', 'success');
                            await handleOptimizeDay();
                            setCreatingAnchor(null);
                        }}
                    />
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
