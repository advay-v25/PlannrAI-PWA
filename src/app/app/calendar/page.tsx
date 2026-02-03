'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { WeekPlanner, PlanWeekFAB } from '@/components/week-planner';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Check, Minus, X, Sparkles, Calendar as CalendarIcon } from 'lucide-react';
import type { ScheduleBlock, BlockStatus, Goal } from '@/types/database';

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

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-future)]/10 via-transparent to-transparent rounded-3xl blur-2xl" />

                <div className="relative glass-card p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-title text-gradient mb-1">Calendar</h1>
                            <p className="text-caption">
                                Track reality, not aspiration
                            </p>
                        </div>

                        <GlassButton
                            variant="primary"
                            onClick={() => setShowWeekPlanner(true)}
                            className="shadow-lg"
                        >
                            <Sparkles className="w-4 h-4" />
                            Plan Week
                        </GlassButton>
                    </div>
                </div>
            </motion.div>

            {/* Week Navigation */}
            <GlassCard padding="md">
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => navigateWeek('prev')}
                        className="p-2 rounded-lg hover:bg-[var(--glass-bg)] transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-medium">
                        {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
                    </span>
                    <button
                        onClick={() => navigateWeek('next')}
                        className="p-2 rounded-lg hover:bg-[var(--glass-bg)] transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                {/* Day Pills */}
                <div className="flex justify-between gap-1">
                    {weekDays.map((day) => {
                        const isSelected = isSameDay(day, selectedDate);
                        const isToday = isSameDay(day, new Date());

                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => setSelectedDate(day)}
                                className={`flex-1 flex flex-col items-center py-3 px-2 rounded-xl transition-all ${isSelected
                                    ? 'bg-[var(--color-primary)] text-white shadow-lg'
                                    : isToday
                                        ? 'bg-[var(--color-primary)]/20 border border-[var(--color-primary)]'
                                        : 'hover:bg-[var(--glass-bg)]'
                                    }`}
                            >
                                <span className={`text-xs ${isSelected ? 'opacity-80' : 'text-[var(--text-tertiary)]'}`}>
                                    {format(day, 'EEE')}
                                </span>
                                <span className={`text-lg font-bold ${isToday && !isSelected ? 'text-[var(--color-primary)]' : ''}`}>
                                    {format(day, 'd')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </GlassCard>

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
                            const categoryColor = block.goal?.category === 'mind'
                                ? 'var(--color-mind)'
                                : block.goal?.category === 'body'
                                    ? 'var(--color-body)'
                                    : 'var(--color-future)';

                            return (
                                <motion.div
                                    key={block.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`transition-opacity ${block.status === 'missed' ? 'opacity-50' : ''}`}
                                >
                                    <GlassCard padding="md">
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
        </div>
    );
}
