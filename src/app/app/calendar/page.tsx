'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCalendar } from '@/hooks/use-calendar';
import { CalendarLayout } from '@/components/calendar/calendar-layout';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { WeekGrid } from '@/components/calendar/week-grid';
import { BlockInspector } from '@/components/calendar/block-inspector';
import { ProactiveInbox } from '@/components/calendar/proactive-inbox';
import { useToast } from '@/components/ui/toast';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Plus, Zap, Layout,
    RotateCcw, Loader2, Calendar, Sparkles, MoreHorizontal
} from 'lucide-react';

import { ConflictModal } from '@/components/calendar/conflict-modal';
import { PlanWeekModal } from '@/components/calendar/plan-week-modal';
import { DayOptimizerModal } from '@/components/calendar/day-optimizer-modal';

export default function CalendarPage() {
    const {
        selectedDate,
        setSelectedDate,
        blocks,
        inbox,
        goals,
        isLoading,
        addBlock,
        autoPlace,
        moveBlock,
        updateBlock,
        deleteBlock,
        createCommitment,
        refresh,
        planWeek,
        optimizeDay,
        applyOption,
        isOptimizing,
        isPlanning,
        lastUndoToken,
        undoLastCalendarAction,
        conflictError,
        dismissConflict
    } = useCalendar();

    const { showToast } = useToast();
    const [selectedBlock, setSelectedBlock] = useState<any>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addModalDefaults, setAddModalDefaults] = useState<{ date?: string; hour?: number }>({});
    const [showPlanWeekModal, setShowPlanWeekModal] = useState(false);
    const [showOptimizerModal, setShowOptimizerModal] = useState(false);
    const [isGeneratingToday, setIsGeneratingToday] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);

    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Count today's blocks and stats
    const todayBlocks = useMemo(() =>
        blocks.filter(b => b.date === todayStr),
        [blocks, todayStr]
    );
    const hasScheduleToday = todayBlocks.length > 0;

    // Day stats for the viewing week
    const viewDateStr = format(selectedDate, 'yyyy-MM-dd');
    const viewDayBlocks = useMemo(() =>
        blocks.filter(b => b.date === viewDateStr),
        [blocks, viewDateStr]
    );
    const dayStats = useMemo(() => {
        const total = viewDayBlocks.length;
        const done = viewDayBlocks.filter(b => b.status === 'done').length;
        const hoursMins = viewDayBlocks.reduce((sum, b) => {
            const [sh, sm] = (b.start_time || '00:00').split(':').map(Number);
            const [eh, em] = (b.end_time || '00:00').split(':').map(Number);
            return sum + ((eh * 60 + em) - (sh * 60 + sm));
        }, 0);
        const hours = Math.round(hoursMins / 60 * 10) / 10;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return { total, done, hours, pct };
    }, [viewDayBlocks]);

    // --- Deviation Handler Auto-Trigger ---
    useEffect(() => {
        if (!blocks || isLoading) return;
        const isViewingToday = format(selectedDate, 'yyyy-MM-dd') === todayStr;
        if (!isViewingToday) return;

        const missedImportant = blocks.filter(b =>
            b.date === todayStr &&
            (b.status === 'missed' || b.status === 'cancelled') &&
            b.block_type !== 'break' &&
            b.block_type !== 'meal'
        );

        if (missedImportant.length >= 2 && !sessionStorage.getItem('deviation_handler_shown')) {
            setShowOptimizerModal(true);
            sessionStorage.setItem('deviation_handler_shown', 'true');
        }
    }, [blocks, selectedDate, isLoading, todayStr]);

    // --- Generate Today's Schedule ---
    const handleGenerateToday = async () => {
        if (isGeneratingToday) return;
        setIsGeneratingToday(true);
        showToast('🤖 Planning your day...', 'info');
        try {
            // Always force to ensure clean generation
            const res = await fetch('/api/calendar/generate-today', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: todayStr, force: true }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || 'Failed to generate plan');
            }

            const planData = await res.json();
            const options = planData.data?.options || planData.options || [];

            if (options.length === 0) {
                showToast('Could not generate schedule. Add goals first.', 'error');
                return;
            }

            // Extract blocks from the first option and apply via apply-schedule
            const firstOption = options[0];
            const ops = firstOption.patch?.ops || [];
            const addBlocks = ops
                .filter((o: any) => o.op === 'create_event' || o.op === 'create')
                .map((o: any) => o.payload || o.event || {});

            const applyRes = await fetch('/api/calendar/apply-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'plan_week',
                    clear_week: true,
                    week_start: todayStr,
                    patch: { add: addBlocks },
                }),
            });

            if (!applyRes.ok) throw new Error('Failed to apply schedule');

            const applyData = await applyRes.json();
            const added = applyData.data?.added || addBlocks.length;
            showToast(`✅ Day planned! ${added} blocks created.`, 'success');
            await refresh();

        } catch (e: any) {
            console.error('Generate today failed:', e);
            showToast(e.message || 'Failed to generate schedule', 'error');
        } finally {
            setIsGeneratingToday(false);
            setShowActionsMenu(false);
        }
    };

    // --- Handlers ---
    const handleBlockMove = async (id: string, date: string, start: string, end: string) => {
        await moveBlock(id, start, end, date);
    };

    const handleBlockAction = async (action: string, payload?: any) => {
        if (!selectedBlock) return;
        try {
            switch (action) {
                case 'done':
                    await updateBlock(selectedBlock.id, { status: 'done' });
                    showToast("✅ Block completed", 'success');
                    break;
                case 'skip':
                    await updateBlock(selectedBlock.id, { status: 'missed' });
                    showToast("Skipped", 'info');
                    break;
                case 'delete':
                    await deleteBlock(selectedBlock.id);
                    setSelectedBlock(null);
                    showToast("Block deleted", 'success');
                    return;
                case 'update':
                    if (payload) {
                        await updateBlock(selectedBlock.id, payload);
                        showToast("Updated", 'success');
                    }
                    break;
            }
            await refresh();
        } catch (e) {
            showToast("Action failed", 'error');
        }
    };

    const handleCellClick = (date: string, hour: number) => {
        setAddModalDefaults({ date, hour });
        setShowAddModal(true);
    };

    const handleAddBlock = async (data: { title: string; date: string; start_time: string; end_time: string; isAnchor?: boolean }) => {
        if (data.isAnchor) {
            await createCommitment(data);
        } else {
            await addBlock({
                context: data.title,
                date: data.date,
                start_time: data.start_time,
                end_time: data.end_time
            });
        }
        setShowAddModal(false);
    };

    // --- Loading ---
    if (isLoading && blocks.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-gradient-to-br from-zinc-950 to-black text-white/50 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Calendar...</span>
            </div>
        );
    }

    // --- Header / Action Bar ---
    const header = (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
                {/* Left: Navigation */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setSelectedDate(subWeeks(selectedDate, 1))}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setSelectedDate(new Date())}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setSelectedDate(addWeeks(selectedDate, 1))}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <h1 className="text-lg font-bold text-white tracking-tight">
                        {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
                    </h1>
                </div>

                {/* Right: Actions — clean dropdown */}
                <div className="flex items-center gap-2 relative">
                    {/* Undo (conditional) */}
                    <AnimatePresence>
                        {lastUndoToken && (
                            <motion.button
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                onClick={undoLastCalendarAction}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                                bg-orange-500/10 border border-orange-500/20 text-orange-400
                                hover:bg-orange-500/20 transition-all"
                            >
                                <RotateCcw className="w-3 h-3" /> Undo
                            </motion.button>
                        )}
                    </AnimatePresence>

                    {/* Primary: Generate Today (prominent when no schedule) */}
                    {!hasScheduleToday && (
                        <button
                            onClick={() => handleGenerateToday()}
                            disabled={isGeneratingToday}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                            bg-gradient-to-r from-violet-600 to-indigo-600 text-white
                            hover:from-violet-500 hover:to-indigo-500
                            disabled:opacity-50 disabled:cursor-wait transition-all shadow-lg shadow-violet-500/20"
                        >
                            {isGeneratingToday ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Planning...</>
                            ) : (
                                <><Sparkles className="w-3.5 h-3.5" /> Plan Today</>
                            )}
                        </button>
                    )}

                    {/* Actions Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                            bg-white/5 border border-white/10 text-white/60
                            hover:bg-white/10 hover:text-white transition-all"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>

                        <AnimatePresence>
                            {showActionsMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 top-full mt-2 w-52 rounded-xl bg-zinc-900/95 border border-white/10
                                    shadow-2xl backdrop-blur-xl z-50 overflow-hidden"
                                >
                                    <div className="p-1.5 space-y-0.5">
                                        <button
                                            onClick={() => { handleGenerateToday(); }}
                                            disabled={isGeneratingToday}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium
                                            text-white/80 hover:bg-white/10 transition-colors text-left"
                                        >
                                            <Sparkles className="w-4 h-4 text-violet-400" />
                                            {hasScheduleToday ? 'Regenerate Today' : 'Plan Today'}
                                        </button>
                                        <button
                                            onClick={() => { setShowOptimizerModal(true); setShowActionsMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium
                                            text-white/80 hover:bg-white/10 transition-colors text-left"
                                        >
                                            <Zap className="w-4 h-4 text-emerald-400" />
                                            Optimize Day
                                        </button>
                                        <button
                                            onClick={() => { setShowPlanWeekModal(true); setShowActionsMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium
                                            text-white/80 hover:bg-white/10 transition-colors text-left"
                                        >
                                            <Layout className="w-4 h-4 text-indigo-400" />
                                            Plan Week
                                        </button>
                                        <div className="border-t border-white/5 my-1" />
                                        <button
                                            onClick={() => { setAddModalDefaults({}); setShowAddModal(true); setShowActionsMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium
                                            text-white/80 hover:bg-white/10 transition-colors text-left"
                                        >
                                            <Plus className="w-4 h-4 text-white/40" />
                                            Add Block
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Day Stats Micro-Bar */}
            {viewDayBlocks.length > 0 && (
                <div className="flex items-center gap-4 mt-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                        <span className="font-bold text-white/50">{dayStats.total}</span> blocks
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                        <span className="font-bold text-white/50">{dayStats.hours}</span> hours
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                        <span className={cn(
                            "font-bold",
                            dayStats.pct >= 70 ? 'text-emerald-400' : dayStats.pct >= 30 ? 'text-amber-400' : 'text-white/50'
                        )}>{dayStats.pct}%</span> done
                    </div>
                    {dayStats.pct > 0 && (
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${dayStats.pct}%` }}
                                className={cn(
                                    "h-full rounded-full transition-all",
                                    dayStats.pct >= 70 ? 'bg-emerald-500' : dayStats.pct >= 30 ? 'bg-amber-500' : 'bg-white/20'
                                )}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // --- Empty State ---
    const emptyState = !hasScheduleToday && !isLoading && format(selectedDate, 'yyyy-MM-dd') === todayStr && (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
        >
            <div className="pointer-events-auto text-center p-8 rounded-2xl bg-zinc-900/80 border border-white/10
                backdrop-blur-xl max-w-sm shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20
                    flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-7 h-7 text-violet-400" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">No schedule for today</h3>
                <p className="text-white/40 text-sm mb-5">
                    Let AI plan your entire day — from morning routine to wind-down — based on your goals.
                </p>
                <button
                    onClick={() => handleGenerateToday()}
                    disabled={isGeneratingToday}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold mx-auto
                        bg-gradient-to-r from-violet-600 to-indigo-600 text-white
                        hover:from-violet-500 hover:to-indigo-500
                        disabled:opacity-50 disabled:cursor-wait transition-all shadow-lg shadow-violet-500/25"
                >
                    {isGeneratingToday ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Planning your day...</>
                    ) : (
                        <><Sparkles className="w-4 h-4" /> Plan Today with AI</>
                    )}
                </button>
            </div>
        </motion.div>
    );

    return (
        <div className="h-screen bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900 text-white overflow-hidden" onClick={() => showActionsMenu && setShowActionsMenu(false)}>
            <CalendarLayout
                showInspector={!!selectedBlock}
                showInbox={!selectedBlock && inbox.length > 0}
                header={header}
                weekGrid={
                    <div className="relative h-full">
                        {emptyState}
                        <WeekGrid
                            date={selectedDate}
                            blocks={blocks}
                            onBlockMove={handleBlockMove}
                            onBlockSelect={setSelectedBlock}
                            onCellClick={handleCellClick}
                        />
                    </div>
                }
                inspector={
                    <BlockInspector
                        block={selectedBlock}
                        onClose={() => setSelectedBlock(null)}
                        onAction={handleBlockAction}
                    />
                }
                inbox={
                    <ProactiveInbox
                        items={inbox}
                        onAutoPlace={autoPlace}
                        isOptimizing={isOptimizing || isPlanning}
                    />
                }
            />

            {/* Add Block Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <AddBlockModal
                        defaults={addModalDefaults}
                        goals={goals}
                        onSubmit={handleAddBlock}
                        onClose={() => setShowAddModal(false)}
                    />
                )}
            </AnimatePresence>

            {/* Plan Week Modal */}
            <AnimatePresence>
                {showPlanWeekModal && (
                    <PlanWeekModal
                        onClose={() => setShowPlanWeekModal(false)}
                        onApply={(opt) => {
                            applyOption(opt);
                            setShowPlanWeekModal(false);
                        }}
                        planWeek={planWeek}
                        context={null}
                    />
                )}
            </AnimatePresence>

            {/* Optimize Day Modal */}
            <AnimatePresence>
                {showOptimizerModal && (
                    <DayOptimizerModal
                        date={selectedDate}
                        onClose={() => setShowOptimizerModal(false)}
                        onApply={(opt) => {
                            applyOption(opt);
                            setShowOptimizerModal(false);
                        }}
                        optimizeDay={optimizeDay}
                    />
                )}
            </AnimatePresence>

            {/* Conflict Resolution Modal */}
            <ConflictModal
                error={conflictError}
                onClose={dismissConflict}
                onConfirmOption={async (opt) => {
                    dismissConflict();
                    try {
                        if (conflictError?.pendingAction) {
                            const { type, payload } = conflictError.pendingAction;
                            if (type === 'create') {
                                await apiClient.schedule.createBlock({ ...payload, resolution_strategy: opt.id });
                            } else if (type === 'move') {
                                await apiClient.schedule.moveBlock(payload.id, payload.newDate, payload.newStart, payload.newEnd, opt.id);
                            }
                            await refresh();
                            showToast("Conflict resolved", "success");
                        }
                    } catch (e) {
                        showToast("Failed to resolve conflict", "error");
                    }
                }}
            />
        </div>
    );
}

// --- Add Block Modal ---
function AddBlockModal({ defaults, goals, onSubmit, onClose }: {
    defaults: { date?: string; hour?: number };
    goals: any[];
    onSubmit: (data: { title: string; date: string; start_time: string; end_time: string; isAnchor: boolean }) => void;
    onClose: () => void;
}) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(defaults.date || format(new Date(), 'yyyy-MM-dd'));
    const [startTime, setStartTime] = useState(
        defaults.hour ? `${defaults.hour.toString().padStart(2, '0')}:00` : '09:00'
    );
    const [endTime, setEndTime] = useState(
        defaults.hour ? `${(defaults.hour + 1).toString().padStart(2, '0')}:00` : '10:00'
    );
    const [isAnchor, setIsAnchor] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSubmit({ title: title.trim(), date, start_time: startTime, end_time: endTime, isAnchor });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.form
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                onSubmit={handleSubmit}
                className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-white font-bold text-lg">Add to Schedule</h2>
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg">
                        <span className="text-xs font-bold text-white/50">Fixed Anchor?</span>
                        <button type="button" onClick={() => setIsAnchor(!isAnchor)}
                            className={cn("w-8 h-4 rounded-full transition-colors relative", isAnchor ? "bg-amber-500" : "bg-white/20")}>
                            <motion.div layout className="w-3 h-3 bg-white rounded-full mx-0.5"
                                style={{ transform: isAnchor ? 'translateX(16px)' : 'translateX(0px)' }} />
                        </button>
                    </div>
                </div>

                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={isAnchor ? "Anchor title (e.g. Gym, Work)" : "Block title..."}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                        placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    autoFocus
                />

                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-[10px] uppercase text-white/30 font-bold">Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-white/30 font-bold">Start</label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-white/30 font-bold">End</label>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                </div>

                {/* Quick goal suggestions */}
                {goals.length > 0 && !title && (
                    <div className="space-y-1.5">
                        <span className="text-[10px] uppercase text-white/30 font-bold">Quick add from goals:</span>
                        <div className="flex flex-wrap gap-1.5">
                            {goals.slice(0, 5).map((g: any) => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setTitle(g.title)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium
                                        bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                >
                                    {g.title}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all">
                        Cancel
                    </button>
                    <button type="submit" disabled={!title.trim()}
                        className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                            isAnchor ? "bg-amber-600 hover:bg-amber-500" : "bg-violet-600 hover:bg-violet-500")}>
                        {isAnchor ? 'Create Anchor' : 'Add Block'}
                    </button>
                </div>
            </motion.form>
        </motion.div>
    );
}
