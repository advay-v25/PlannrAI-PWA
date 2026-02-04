'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { WeekPlanner, PlanWeekFAB } from '@/components/week-planner';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Check, Minus, X, Sparkles, Calendar as CalendarIcon, AlertTriangle, ZapOff, Plus, Trash2, Anchor, Repeat, Brain } from 'lucide-react';
import type { ScheduleBlock, BlockStatus, Goal } from '@/types/database';
import { useScheduleWatchdog } from '@/hooks/use-schedule-watchdog';
import { useDailyLogStore, useUserStore } from '@/stores';

const STATUS_CONFIG: Record<BlockStatus, { icon: React.ReactNode; color: string; label: string }> = {
    planned: { icon: null, color: 'var(--color-text-muted)', label: 'Planned' },
    done: { icon: <Check className="w-3 h-3" />, color: 'var(--color-success)', label: 'Done' },
    partial: { icon: <Minus className="w-3 h-3" />, color: 'var(--color-warning)', label: 'Partial' },
    missed: { icon: <X className="w-3 h-3" />, color: 'var(--color-muted)', label: 'Missed' },
};

export default function CalendarPage() {
    const supabase = createClient();
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

    const handleUpdateBlock = async () => {
        if (!editingBlock) return;

        // Optimistic update
        setBlocks(prev => prev.map(b => b.id === editingBlock.id ? editingBlock : b));
        setEditingBlock(null);

        await supabase
            .from('schedule_blocks')
            .update({
                start_time: editingBlock.start_time,
                end_time: editingBlock.end_time,
                context: editingBlock.context
            })
            .eq('id', editingBlock.id);
    };

    const handleDeleteBlock = async () => {
        if (!editingBlock) return;

        // Optimistic delete
        setBlocks(prev => prev.filter(b => b.id !== editingBlock.id));
        setEditingBlock(null);

        await supabase
            .from('schedule_blocks')
            .delete()
            .eq('id', editingBlock.id);
    };

    const handleCreateBlock = async () => {
        if (!creatingBlock) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newBlock = {
            user_id: user.id,
            date: format(selectedDate, 'yyyy-MM-dd'),
            start_time: creatingBlock.start_time,
            end_time: creatingBlock.end_time,
            context: creatingBlock.context || 'New Task',
            status: 'planned' as BlockStatus,
            block_type: 'goal', // Manual tasks are flexible (Level 3/4)
            goal_id: null
        };

        const { data } = await supabase
            .from('schedule_blocks')
            .insert(newBlock)
            .select()
            .single();

        if (data) {
            setBlocks(prev => [...prev, data as any].sort((a, b) => a.start_time.localeCompare(b.start_time)));
        }

        setCreatingBlock(null);
    };

    const handleCreateAnchor = async () => {
        if (!creatingAnchor) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Insert into Commitments (Source of Truth)
        const { error } = await supabase
            .from('commitments')
            .insert({
                user_id: user.id,
                title: creatingAnchor.title,
                start_time: creatingAnchor.start_time,
                end_time: creatingAnchor.end_time,
                days_of_week: creatingAnchor.days
            });

        if (error) {
            console.error(error);
            return;
        }

        // 2. Refresh Day (Trigger Optimizer to place the new anchor)
        await handleOptimizeDay();
        setCreatingAnchor(null);
    };

    useEffect(() => {
        async function loadData() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Load goals for reference
            const { data: goalsData } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', user.id);
            if (goalsData) setGoals(goalsData);

            // Load blocks for selected date
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const { data: blocksData } = await supabase
                .from('schedule_blocks')
                .select('*, goal:goals(*)')
                .eq('user_id', user.id)
                .eq('date', dateStr)
                .order('start_time');

            if (blocksData) setBlocks(blocksData);
            setIsLoading(false);
        }

        loadData();
    }, [supabase, selectedDate]);

    const handleStatusChange = async (blockId: string, newStatus: BlockStatus) => {
        // Update locally
        setBlocks((prev) =>
            prev.map((b) => (b.id === blockId ? { ...b, status: newStatus } : b))
        );

        // Update in database
        await supabase
            .from('schedule_blocks')
            .update({ status: newStatus })
            .eq('id', blockId);
    };

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const navigateWeek = (direction: 'prev' | 'next') => {
        const newWeekStart = addDays(weekStart, direction === 'next' ? 7 : -7);
        setWeekStart(newWeekStart);
        setSelectedDate(newWeekStart);
    };

    const handlePlanApplied = () => {
        // Refresh the blocks for the current date
        setIsLoading(true);
        setShowWeekPlanner(false);
        // Trigger reload
        setSelectedDate(new Date(selectedDate));
    };

    const handleOptimizeDay = async () => {
        setIsOptimizing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Call API
            const res = await fetch('/api/ai/optimize-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    blocks,
                    energyLevel: todayLog?.energy_level || 3
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Optimization failed');
            }

            const { data } = await res.json();

            // Apply updates
            const optimizedBlocks = data.optimizedBlocks;
            const summary = data.summary;
            const warning = data.message; // "You've planned more than fits..."

            // Update local state immediately (API has already persisted)
            setBlocks(optimizedBlocks.sort((a: any, b: any) => a.start_time.localeCompare(b.start_time)));

            // Show feedback
            if (warning) {
                alert(warning); // Simple alert as per manifesto requirement for visibility
            } else {
                console.log("Optimized:", summary);
            }

        } catch (error: any) {
            console.error(error);
            // Manifesto Rule: Show specific error message
            alert(error.message || "I can't place two blocks at the same time. Adjust goals or intensity.");
        } finally {
            setIsOptimizing(false);
        }
    };

    // Analyze Day Feature
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);

    const handleAnalyzeDay = async () => {
        setIsAnalyzing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Reuse Coach API but contextually focused on today's schedule
            const res = await fetch('/api/coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Analyze my schedule for today (${format(selectedDate, 'yyyy-MM-dd')}). Here are my blocks: ${JSON.stringify(blocks.map(b => ({
                        time: b.start_time,
                        activity: b.context,
                        type: b.block_type
                    })))}. Brief me on potential friction points or energy risks. Keep it under 50 words.`
                })
            });

            const data = await res.json();
            if (data.formatted) {
                setAnalysisResult(data.formatted);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };


    return (
        <div className="space-y-6">
            {/* Header */}
            return (
            <div className="space-y-8 pb-12">
                {/* Minimalist Navigation & Action Center */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight text-gradient">Timeline</h1>
                        <p className="text-sm text-[var(--text-tertiary)] tracking-wide uppercase mt-1">
                            Precision Execution • {format(selectedDate, 'MMMM yyyy')}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <GlassCard padding="none" className="flex items-center overflow-hidden border-white/5 bg-white/5">
                            <button
                                onClick={() => navigateWeek('prev')}
                                className="p-3 hover:bg-white/10 transition-colors border-r border-white/5"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setSelectedDate(new Date())}
                                className="px-4 py-2 text-xs font-bold tracking-widest uppercase hover:bg-white/10 transition-colors"
                            >
                                Today
                            </button>
                            <button
                                onClick={() => navigateWeek('next')}
                                className="p-3 hover:bg-white/10 transition-colors border-l border-white/5"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </GlassCard>

                        <div className="h-8 w-[1px] bg-white/10 mx-1" />

                        <GlassButton
                            variant="primary"
                            onClick={() => setShowWeekPlanner(true)}
                            className="shadow-glow"
                        >
                            <Sparkles className="w-4 h-4" />
                            Optimize Week
                        </GlassButton>
                    </div>
                </div>

                {/* Horizontal Sleek Day Selector */}
                <GlassCard padding="sm" variant="deep" className="border-white/5 shadow-2xl">
                    <div className="flex justify-between gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {weekDays.map((day) => {
                            const isSelected = isSameDay(day, selectedDate);
                            const isToday = isSameDay(day, new Date());

                            return (
                                <button
                                    key={day.toISOString()}
                                    onClick={() => setSelectedDate(day)}
                                    className={`flex-1 min-w-[70px] flex flex-col items-center py-4 rounded-2xl transition-all duration-500 relative ${isSelected
                                        ? 'bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.2)]'
                                        : 'hover:bg-white/5 text-[var(--text-secondary)]'
                                        }`}
                                >
                                    <span className={`text-[10px] font-bold tracking-tighter mb-1 ${isSelected ? 'opacity-60' : 'text-[var(--text-tertiary)]'}`}>
                                        {format(day, 'EEE').toUpperCase()}
                                    </span>
                                    <span className="text-xl font-bold font-mono">
                                        {format(day, 'd')}
                                    </span>
                                    {isToday && !isSelected && (
                                        <div className="absolute bottom-2 w-1 h-1 rounded-full bg-[var(--color-primary)] shadow-glow" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </GlassCard>

                {/* Proactive Tools */}
                {hasConflicts && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <GlassCard variant="glow" padding="md" className="flex items-center justify-between border-[var(--color-error)]/20 animate-pulse-slow">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-[var(--color-error)]/10">
                                    <AlertTriangle className="w-5 h-5 text-[var(--color-error)]" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Schedule Friction Detected</p>
                                    <p className="text-xs text-[var(--text-secondary)]">Overlaps identified in your flow.</p>
                                </div>
                            </div>
                            <GlassButton
                                variant="primary"
                                size="sm"
                                onClick={handleOptimizeDay}
                                loading={isOptimizing}
                            >
                                Auto-Resolve
                            </GlassButton>
                        </GlassCard>
                    </motion.div>
                )}

                {/* Timeline */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-[var(--text-secondary)]">
                        {format(selectedDate, 'EEEE, MMMM d')}
                    </h2>

                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : blocks.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <GlassCard padding="lg" className="text-center">
                                <div className="w-16 h-16 rounded-full bg-[var(--color-future)]/20 flex items-center justify-center mx-auto mb-4">
                                    <CalendarIcon className="w-8 h-8 text-[var(--color-future)]" />
                                </div>
                                <h3 className="font-semibold mb-1">No blocks scheduled</h3>
                                <p className="text-sm text-[var(--text-tertiary)] mb-4">
                                    Let AI plan your week based on your goals
                                </p>
                                <GlassButton
                                    variant="primary"
                                    onClick={() => setShowWeekPlanner(true)}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Plan My Week
                                </GlassButton>
                            </GlassCard>
                        </motion.div>
                    ) : (
                        <div className="space-y-2">
                            {blocks.map((block, index) => {
                                const statusConfig = STATUS_CONFIG[block.status];
                                let categoryColor = block.goal?.category === 'mind'
                                    ? 'var(--color-mind)'
                                    : block.goal?.category === 'body'
                                        ? 'var(--color-body)'
                                        : 'var(--color-craft)'; // Renamed future -> craft

                                // Visual Hierarchy Overrides
                                const isAnchor = block.block_type === 'anchor';
                                const isMeal = block.block_type === 'meal';
                                const isRoutine = block.block_type === 'routine';

                                if (isAnchor) categoryColor = 'var(--text-secondary)'; // Boring/Stable
                                if (isMeal) categoryColor = 'var(--color-accent-2)'; // Organic
                                if (isRoutine) categoryColor = '#34d399'; // Emerald-400 (Bio/Alive)

                                const conflict = conflicts.find(c => c.blockId === block.id);
                                const isOverlap = conflict?.type === 'overlap';
                                const isEnergyIssue = conflict?.type === 'energy_mismatch';

                                return (
                                    <motion.div
                                        key={block.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className={`transition-opacity ${block.status === 'missed' ? 'opacity-50' : ''}`}
                                    >
                                        <GlassCard
                                            padding="md"
                                            className={`
                                            transition-all duration-300
                                            ${isOverlap ? 'ring-2 ring-[var(--color-error)] border-[var(--color-error)]/20' : ''}
                                            ${isEnergyIssue ? 'ring-2 ring-[var(--color-warning)] border-[var(--color-warning)]/20' : ''}
                                            ${isAnchor ? 'border-l-4 border-l-[var(--text-secondary)] bg-[var(--glass-bg-subtle)]' : ''}
                                            ${isRoutine ? 'border-l-4 border-l-emerald-500 bg-emerald-500/10' : ''}
                                        `}
                                        >
                                            <div
                                                className="flex items-start gap-4 cursor-pointer"
                                                onClick={() => setEditingBlock(block)}
                                            >
                                                {/* Time Column */}
                                                <div className="text-center w-14 flex-shrink-0">
                                                    <p className="text-sm font-medium">{block.start_time.slice(0, 5)}</p>
                                                    <p className="text-xs text-[var(--text-tertiary)]">{block.end_time.slice(0, 5)}</p>
                                                </div>

                                                {/* Category Bar */}
                                                <div
                                                    className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: categoryColor }}
                                                />

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">
                                                        {block.goal?.title || block.context || 'Untitled Block'}
                                                    </p>
                                                    {block.context && block.goal?.title && (
                                                        <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                                                            {block.context}
                                                        </p>
                                                    )}
                                                    {conflict && (
                                                        <div className={`flex items-center gap-1 mt-1 text-xs font-medium 
                                                        ${isOverlap ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'}`}>
                                                            {isOverlap ? <AlertTriangle className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
                                                            {conflict.message}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Status Buttons */}
                                                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                                    {(['done', 'partial', 'missed'] as BlockStatus[]).map((status) => {
                                                        const config = STATUS_CONFIG[status];
                                                        const isActive = block.status === status;

                                                        return (
                                                            <motion.button
                                                                key={status}
                                                                onClick={() => handleStatusChange(block.id, status)}
                                                                className={`p-2 rounded-xl transition-all ${isActive
                                                                    ? 'bg-[var(--glass-bg-active)]'
                                                                    : 'hover:bg-[var(--glass-bg)]'
                                                                    }`}
                                                                style={{ color: isActive ? config.color : 'var(--text-tertiary)' }}
                                                                title={config.label}
                                                                whileHover={{ scale: 1.1 }}
                                                                whileTap={{ scale: 0.9 }}
                                                            >
                                                                {config.icon || <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'currentColor' }} />}
                                                            </motion.button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </GlassCard>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Floating Action Button for Week Planner */}
                <PlanWeekFAB onClick={() => setShowWeekPlanner(true)} />

                {/* Week Planner Modal */}
                <AnimatePresence>
                    {showWeekPlanner && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowWeekPlanner(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 20 }}
                                className="w-full max-w-lg max-h-[85vh] overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <WeekPlanner
                                    onClose={() => setShowWeekPlanner(false)}
                                    onApply={handlePlanApplied}
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Edit Block Modal */}
                <AnimatePresence>
                    {editingBlock && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                            onClick={() => setEditingBlock(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 20 }}
                                className="glass-card p-6 w-full max-w-md space-y-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-lg font-bold">Edit Block</h3>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-[var(--text-secondary)]">Activity</label>
                                        <GlassInput
                                            value={editingBlock.context || ''}
                                            onChange={(e) => setEditingBlock({ ...editingBlock, context: e.target.value })}
                                            placeholder="What are you doing?"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm text-[var(--text-secondary)]">Start</label>
                                            <GlassInput
                                                type="time"
                                                value={editingBlock.start_time.slice(0, 5)}
                                                onChange={(e) => setEditingBlock({ ...editingBlock, start_time: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-[var(--text-secondary)]">End</label>
                                            <GlassInput
                                                type="time"
                                                value={editingBlock.end_time.slice(0, 5)}
                                                onChange={(e) => setEditingBlock({ ...editingBlock, end_time: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <GlassButton
                                        variant="danger"
                                        onClick={handleDeleteBlock}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </GlassButton>
                                    <GlassButton
                                        className="flex-1"
                                        variant="ghost"
                                        onClick={() => setEditingBlock(null)}
                                    >
                                        Cancel
                                    </GlassButton>
                                    <GlassButton
                                        className="flex-1"
                                        variant="primary"
                                        onClick={handleUpdateBlock}
                                    >
                                        Save Changes
                                    </GlassButton>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Create Block Modal */}
                <AnimatePresence>
                    {creatingBlock && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                            onClick={() => setCreatingBlock(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 20 }}
                                className="glass-card p-6 w-full max-w-md space-y-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-lg font-bold">Add Block</h3>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-[var(--text-secondary)]">Activity</label>
                                        <GlassInput
                                            value={creatingBlock.context}
                                            onChange={(e) => setCreatingBlock({ ...creatingBlock, context: e.target.value })}
                                            placeholder="What are you doing?"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm text-[var(--text-secondary)]">Start</label>
                                            <GlassInput
                                                type="time"
                                                value={creatingBlock.start_time}
                                                onChange={(e) => setCreatingBlock({ ...creatingBlock, start_time: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-[var(--text-secondary)]">End</label>
                                            <GlassInput
                                                type="time"
                                                value={creatingBlock.end_time}
                                                onChange={(e) => setCreatingBlock({ ...creatingBlock, end_time: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <GlassButton
                                        className="flex-1"
                                        variant="ghost"
                                        onClick={() => setCreatingBlock(null)}
                                    >
                                        Cancel
                                    </GlassButton>
                                    <GlassButton
                                        className="flex-1"
                                        variant="primary"
                                        onClick={handleCreateBlock}
                                    >
                                        Create Block
                                    </GlassButton>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Create Anchor Modal */}
                <AnimatePresence>
                    {creatingAnchor && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                            onClick={() => setCreatingAnchor(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 20 }}
                                className="glass-card p-6 w-full max-w-md space-y-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <Anchor className="w-5 h-5 text-[var(--text-secondary)]" />
                                    <h3 className="text-lg font-bold">Add Anchor</h3>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-[var(--text-secondary)]">Commitment</label>
                                        <GlassInput
                                            value={creatingAnchor.title}
                                            onChange={(e) => setCreatingAnchor({ ...creatingAnchor, title: e.target.value })}
                                            placeholder="e.g. Work, Class (Fixed)"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm text-[var(--text-secondary)]">Start</label>
                                            <GlassInput type="time" value={creatingAnchor.start_time} onChange={(e) => setCreatingAnchor({ ...creatingAnchor, start_time: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-[var(--text-secondary)]">End</label>
                                            <GlassInput type="time" value={creatingAnchor.end_time} onChange={(e) => setCreatingAnchor({ ...creatingAnchor, end_time: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                                            <Repeat className="w-3 h-3" /> Repeats on
                                        </label>
                                        <div className="flex justify-between gap-1">
                                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        const days = creatingAnchor.days.includes(i)
                                                            ? creatingAnchor.days.filter(d => d !== i)
                                                            : [...creatingAnchor.days, i];
                                                        setCreatingAnchor({ ...creatingAnchor, days });
                                                    }}
                                                    className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${creatingAnchor.days.includes(i)
                                                        ? 'bg-[var(--text-secondary)] text-[var(--color-bg-primary)]'
                                                        : 'bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:bg-[var(--glass-bg-hover)]'
                                                        }`}
                                                >
                                                    {d}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-4">
                                    <GlassButton
                                        className="flex-1"
                                        variant="ghost"
                                        onClick={() => setCreatingAnchor(null)}
                                    >
                                        Cancel
                                    </GlassButton>
                                    <GlassButton
                                        className="flex-1"
                                        variant="primary"
                                        onClick={handleCreateAnchor}
                                    >
                                        Save Anchor
                                    </GlassButton>
                                </div>
                            </motion.div>
                        </motion.div>
            </div>
        </AnimatePresence>
    );
}
