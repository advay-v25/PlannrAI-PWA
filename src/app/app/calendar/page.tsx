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
    const [isOptimizing, setIsLoadingOptimizing] = useState(false);

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
        setBlocks(prev => prev.filter(b => b.id !== editingBlock.id));
        setEditingBlock(null);
        await supabase.from('schedule_blocks').delete().eq('id', editingBlock.id);
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
            block_type: 'goal',
            goal_id: null
        };
        const { data } = await supabase.from('schedule_blocks').insert(newBlock).select().single();
        if (data) setBlocks(prev => [...prev, data as any].sort((a, b) => a.start_time.localeCompare(b.start_time)));
        setCreatingBlock(null);
    };

    const handleCreateAnchor = async () => {
        if (!creatingAnchor) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase.from('commitments').insert({
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
        await handleOptimizeDay();
        setCreatingAnchor(null);
    };

    useEffect(() => {
        async function loadData() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: goalsData } = await supabase.from('goals').select('*').eq('user_id', user.id);
            if (goalsData) setGoals(goalsData);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const { data: blocksData } = await supabase.from('schedule_blocks').select('*, goal:goals(*)').eq('user_id', user.id).eq('date', dateStr).order('start_time');
            if (blocksData) setBlocks(blocksData);
            setIsLoading(false);
        }
        loadData();
    }, [supabase, selectedDate]);

    const handleStatusChange = async (blockId: string, newStatus: BlockStatus) => {
        setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, status: newStatus } : b)));
        await supabase.from('schedule_blocks').update({ status: newStatus }).eq('id', blockId);
    };

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const navigateWeek = (direction: 'prev' | 'next') => {
        const newWeekStart = addDays(weekStart, direction === 'next' ? 7 : -7);
        setWeekStart(newWeekStart);
        setSelectedDate(newWeekStart);
    };

    const handlePlanApplied = () => {
        setIsLoading(true);
        setShowWeekPlanner(false);
        setSelectedDate(new Date(selectedDate));
    };

    const handleOptimizeDay = async () => {
        setIsLoadingOptimizing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const res = await fetch('/api/ai/optimize-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    blocks,
                    energyLevel: todayLog?.energy_level || 3
                })
            });
            if (!res.ok) throw new Error('Optimization failed');
            const { data } = await res.json();
            setBlocks(data.optimizedBlocks.sort((a: any, b: any) => a.start_time.localeCompare(b.start_time)));
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Optimization error.");
        } finally {
            setIsLoadingOptimizing(false);
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-gradient">Timeline</h1>
                    <p className="text-sm text-[var(--text-tertiary)] tracking-wide uppercase mt-1">
                        Precision Execution • {format(selectedDate, 'MMMM yyyy')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <GlassCard padding="none" className="flex items-center overflow-hidden border-white/5 bg-white/5">
                        <button onClick={() => navigateWeek('prev')} className="p-3 hover:bg-white/10 transition-colors border-r border-white/5">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setSelectedDate(new Date())} className="px-4 py-2 text-xs font-bold tracking-widest uppercase hover:bg-white/10 transition-colors">
                            Today
                        </button>
                        <button onClick={() => navigateWeek('next')} className="p-3 hover:bg-white/10 transition-colors border-l border-white/5">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </GlassCard>

                    <div className="h-8 w-[1px] bg-white/10 mx-1" />

                    <GlassButton variant="primary" onClick={() => setShowWeekPlanner(true)} className="shadow-glow">
                        <Sparkles className="w-4 h-4" />
                        Optimize Week
                    </GlassButton>
                </div>
            </div>

            {/* Day Selector */}
            <GlassCard padding="sm" variant="deep" className="border-white/5 shadow-2xl">
                <div className="flex justify-between gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {weekDays.map((day) => {
                        const isSelected = isSameDay(day, selectedDate);
                        const isToday = isSameDay(day, new Date());
                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => setSelectedDate(day)}
                                className={`flex-1 min-w-[70px] flex flex-col items-center py-4 rounded-2xl transition-all duration-500 relative ${isSelected ? 'bg-white text-black shadow-lg shadow-white/20' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}
                            >
                                <span className={`text-[10px] font-bold tracking-tighter mb-1 ${isSelected ? 'opacity-60' : 'text-[var(--text-tertiary)]'}`}>
                                    {format(day, 'EEE').toUpperCase()}
                                </span>
                                <span className="text-xl font-bold font-mono">{format(day, 'd')}</span>
                                {isToday && !isSelected && <div className="absolute bottom-2 w-1 h-1 rounded-full bg-[var(--color-primary)] shadow-glow" />}
                            </button>
                        );
                    })}
                </div>
            </GlassCard>

            {/* Conflicts */}
            {hasConflicts && (
                <GlassCard variant="glow" padding="md" className="flex items-center justify-between border-[var(--color-error)]/20">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-[var(--color-error)]" />
                        <div>
                            <p className="text-sm font-bold">Schedule Friction Detected</p>
                            <p className="text-xs text-[var(--text-secondary)]">Overlaps identified in your flow.</p>
                        </div>
                    </div>
                    <GlassButton variant="primary" size="sm" onClick={handleOptimizeDay} loading={isOptimizing}>
                        Auto-Resolve
                    </GlassButton>
                </GlassCard>
            )}

            {/* Timeline View */}
            <div className="space-y-3">
                <h2 className="text-sm font-medium text-[var(--text-secondary)]">{format(selectedDate, 'EEEE, MMMM d')}</h2>
                {isLoading ? (
                    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
                ) : blocks.length === 0 ? (
                    <GlassCard padding="lg" className="text-center">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4"><CalendarIcon className="w-8 h-8 opacity-20" /></div>
                        <h3 className="font-semibold mb-1">No blocks scheduled</h3>
                        <p className="text-sm text-[var(--text-tertiary)] mb-4">Let AI plan your week based on your goals</p>
                        <GlassButton variant="primary" onClick={() => setShowWeekPlanner(true)}><Sparkles className="w-4 h-4" /> Plan My Week</GlassButton>
                    </GlassCard>
                ) : (
                    <div className="space-y-2">
                        {blocks.map((block, index) => (
                            <motion.div key={block.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
                                <GlassCard padding="md" interactive onClick={() => setEditingBlock(block)} className={block.status === 'missed' ? 'opacity-50' : ''}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 text-center flex-shrink-0">
                                            <p className="text-sm font-bold">{block.start_time.slice(0, 5)}</p>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{block.goal?.title || block.context || 'Untitled'}</p>
                                        </div>
                                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                            {(['done', 'missed'] as BlockStatus[]).map((status) => (
                                                <button
                                                    key={status}
                                                    onClick={() => handleStatusChange(block.id, status)}
                                                    className={`p-2 rounded-lg transition-colors ${block.status === status ? 'bg-white/10' : 'opacity-40 hover:opacity-100'}`}
                                                >
                                                    {status === 'done' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        ))}
                    </div>
                )}
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
                        <GlassCard className="w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-bold">Edit Entry</h3>
                            <GlassInput value={editingBlock.context || ''} onChange={e => setEditingBlock({ ...editingBlock, context: e.target.value })} />
                            <div className="flex gap-2">
                                <GlassButton variant="danger" onClick={handleDeleteBlock}><Trash2 className="w-4 h-4" /></GlassButton>
                                <GlassButton className="flex-1" variant="primary" onClick={handleUpdateBlock}>Save</GlassButton>
                            </div>
                        </GlassCard>
                    </div>
                )}
            </AnimatePresence>
            <PlanWeekFAB onClick={() => setShowWeekPlanner(true)} />
        </div>
    );
}
