'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useCalendar } from '@/hooks/use-calendar';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

import { WeekGrid } from '@/components/calendar/week-grid';
import { BlockInspector } from '@/components/calendar/block-inspector';
import { useToast } from '@/components/ui/toast';
import { format, startOfWeek, addDays, addWeeks, subWeeks, subDays, isSameDay, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Plus, Zap, Layout,
    RotateCcw, Loader2, Calendar, Sparkles, MessageSquare,
    Target, Clock, CheckCircle2, X, Download
} from 'lucide-react';

import { ConflictModal } from '@/components/calendar/conflict-modal';
import { PlanWeekModal } from '@/components/calendar/plan-week-modal';
import { DayOptimizerModal } from '@/components/calendar/day-optimizer-modal';


// ── Types ────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week';

// ── Mini Calendar Component ──────────────────────────────────────
function MiniCalendar({ selectedDate, onSelectDate }: { selectedDate: Date; onSelectDate: (d: Date) => void }) {
    const [viewMonth, setViewMonth] = useState(new Date(selectedDate));
    const monthStart = startOfMonth(viewMonth);
    const firstDayOffset = getDay(monthStart); // 0=Sun
    const daysInMonth = getDaysInMonth(viewMonth);
    const today = new Date();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDayOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));

    return (
        <div className="select-none">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white/90">{format(viewMonth, 'MMMM yyyy')}</span>
                <div className="flex gap-1">
                    <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1))}
                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1))}
                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-[10px] font-bold text-white/30 py-1">{d}</div>
                ))}
                {cells.map((date, i) => {
                    if (!date) return <div key={`empty-${i}`} />;
                    const isToday = isSameDay(date, today);
                    const isSelected = isSameDay(date, selectedDate);
                    return (
                        <button
                            key={i}
                            onClick={() => onSelectDate(date)}
                            className={cn(
                                "w-7 h-7 rounded-full text-xs font-medium transition-all flex items-center justify-center mx-auto",
                                isSelected ? "bg-orange-500 text-black font-bold" :
                                isToday ? "bg-white/10 text-white font-bold ring-1 ring-orange-500/50" :
                                "text-white/50 hover:bg-white/10 hover:text-white"
                            )}
                        >
                            {date.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Daily Goal Progress Ring ─────────────────────────────────────
function DailyGoalRing({ pct }: { pct: number }) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    return (
        <div className="relative w-28 h-28 mx-auto">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <circle cx="50" cy="50" r={radius} fill="none" stroke="url(#orangeGrad)" strokeWidth="8"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
                    className="transition-all duration-1000 ease-out" />
                <defs>
                    <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white">{pct}%</span>
            </div>
        </div>
    );
}

// ── Task Category Summary ────────────────────────────────────────
function TaskCategories({ blocks }: { blocks: any[] }) {
    const categories = useMemo(() => {
        const map: Record<string, { count: number; color: string }> = {};
        const colorMap: Record<string, string> = {
            goal: 'bg-orange-400', anchor: 'bg-zinc-400', meal: 'bg-emerald-400',
            routine: 'bg-violet-400', buffer: 'bg-blue-400', flex: 'bg-amber-400',
            sleep: 'bg-zinc-600', wind_down: 'bg-indigo-400',
        };
        blocks.forEach(b => {
            const type = b.block_type || 'other';
            if (!map[type]) map[type] = { count: 0, color: colorMap[type] || 'bg-white/30' };
            map[type].count++;
        });
        return Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    }, [blocks]);

    if (categories.length === 0) return null;

    return (
        <div className="space-y-2">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider">Tasks</h4>
            {categories.map(([type, { count, color }]) => (
                <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2.5 h-2.5 rounded-sm", color)} />
                        <span className="text-xs text-white/60 capitalize">{type.replace('_', ' ')}</span>
                    </div>
                    <span className="text-xs font-bold text-white/80">{count}</span>
                </div>
            ))}
        </div>
    );
}

// ── Main Calendar Page ───────────────────────────────────────────
export default function CalendarPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-black text-white/50 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Calendar...</span>
            </div>
        }>
            <CalendarPageInner />
        </Suspense>
    );
}

function CalendarPageInner() {
    const {
        selectedDate, setSelectedDate,
        blocks, inbox, goals,
        isLoading,
        addBlock, autoPlace, moveBlock, updateBlock, deleteBlock,
        createCommitment, refresh,
        planWeek, optimizeDay, applyOption,
        isOptimizing, isPlanning,
        lastUndoToken, undoLastCalendarAction,
        conflictError, dismissConflict
    } = useCalendar();

    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [selectedBlock, setSelectedBlock] = useState<any>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addModalDefaults, setAddModalDefaults] = useState<{ date?: string; hour?: number }>({});
    const [showPlanWeekModal, setShowPlanWeekModal] = useState(false);
    const [showOptimizerModal, setShowOptimizerModal] = useState(false);

    const [isGeneratingToday, setIsGeneratingToday] = useState(false);
    const [autoPlanned, setAutoPlanned] = useState(false);

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const viewDateStr = format(selectedDate, 'yyyy-MM-dd');
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });

    // ── Auto-plan after onboarding ───────────────────────────────
    useEffect(() => {
        const setupComplete = searchParams.get('setup');
        if (setupComplete === 'complete' && !autoPlanned && !isLoading) {
            setAutoPlanned(true);
            handleGenerateToday(todayStr);
        }
        
        const action = searchParams.get('action');
        if (action === 'optimize_day') {
            setShowOptimizerModal(true);
            // optionally clean up URL
            const url = new URL(window.location.href);
            url.searchParams.delete('action');
            window.history.replaceState({}, '', url);
        }
    }, [searchParams, isLoading, autoPlanned]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Day Stats ────────────────────────────────────────────────
    const viewDayBlocks = useMemo(() =>
        blocks.filter(b => b.date === viewDateStr), [blocks, viewDateStr]
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

    const todayBlocks = useMemo(() => blocks.filter(b => b.date === todayStr), [blocks, todayStr]);
    const hasScheduleToday = todayBlocks.length > 0;

    // ── Generate Today ───────────────────────────────────────────
    const handleGenerateToday = async (targetDateOverride?: string) => {
        if (isGeneratingToday) return;
        setIsGeneratingToday(true);
        const targetDate = targetDateOverride || format(new Date(), 'yyyy-MM-dd');
        showToast('🤖 Planning your day...', 'info');
        try {
            const res = await fetch('/api/calendar/generate-today', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: targetDate, force: true }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || 'Failed to generate plan');
            }
            const planData = await res.json();
            const options = planData.data?.options || planData.options || [];
            if (options.length === 0) {
                showToast('No schedule generated. Add goals first.', 'error');
                return;
            }
            const firstOption = options[0];
            const ops = firstOption.patch?.ops || [];
            const addBlocks = ops
                .filter((o: any) => o.op === 'create_event' || o.op === 'create')
                .map((o: any) => o.payload || o.event || {});

            const applyRes = await fetch('/api/calendar/apply-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'optimize_day',
                    clear_date: targetDate,
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
        }
    };

    // ── Handlers ─────────────────────────────────────────────────
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
        } catch {
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
            await addBlock({ context: data.title, date: data.date, start_time: data.start_time, end_time: data.end_time });
        }
        setShowAddModal(false);
    };

    // Navigation
    const navigateDate = (dir: -1 | 1) => {
        if (viewMode === 'week') {
            setSelectedDate(dir === -1 ? subWeeks(selectedDate, 1) : addWeeks(selectedDate, 1));
        } else {
            setSelectedDate(dir === -1 ? subDays(selectedDate, 1) : addDays(selectedDate, 1));
        }
    };

    // ── Loading ──────────────────────────────────────────────────
    if (isLoading && blocks.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white/50 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Calendar...</span>
            </div>
        );
    }

    // ── Date title ───────────────────────────────────────────────
    const dateTitle = viewMode === 'week'
        ? `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
        : format(selectedDate, 'd MMMM yyyy');

    return (
        <div className="h-screen bg-black text-white overflow-hidden flex flex-col">

            {/* ── Top Header ────────────────────────────────────── */}
            <div className="shrink-0 px-6 py-3 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                    {/* Left: Nav + Date */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-0.5">
                            <button onClick={() => navigateDate(-1)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button onClick={() => setSelectedDate(new Date())}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white/40 hover:text-white hover:bg-white/8 transition-colors uppercase tracking-wider">
                                Today
                            </button>
                            <button onClick={() => navigateDate(1)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <span className="text-sm font-semibold text-white/80 tracking-tight">{dateTitle}</span>
                    </div>

                    {/* Right: Compact Actions */}
                    <div className="flex items-center gap-1.5">
                        {/* View Toggle */}
                        <div className="flex bg-white/[0.04] rounded-lg p-0.5 mr-1">
                            <button onClick={() => setViewMode('day')}
                                className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                                    viewMode === 'day' ? "bg-orange-500 text-black" : "text-white/40 hover:text-white")}>
                                Day
                            </button>
                            <button onClick={() => setViewMode('week')}
                                className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                                    viewMode === 'week' ? "bg-orange-500 text-black" : "text-white/40 hover:text-white")}>
                                Week
                            </button>
                        </div>

                        {/* Undo */}
                        <AnimatePresence>
                            {lastUndoToken && (
                                <motion.button
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    onClick={undoLastCalendarAction}
                                    title="Undo last action"
                                    className="p-2 rounded-lg text-orange-400/80 bg-orange-500/10 border border-orange-500/15
                                    hover:bg-orange-500/20 transition-all">
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {/* AI: Optimize Day */}
                        <button onClick={() => setShowOptimizerModal(true)}
                            title="Optimize today's schedule with AI"
                            className="p-2 rounded-lg text-white/40
                            hover:bg-white/[0.06] hover:text-orange-400 transition-all">
                            <Zap className="w-4 h-4" />
                        </button>

                        {/* AI: Plan Week */}
                        <button onClick={() => setShowPlanWeekModal(true)}
                            title="Plan your entire week with AI"
                            className="p-2 rounded-lg text-white/40
                            hover:bg-white/[0.06] hover:text-orange-400 transition-all">
                            <Layout className="w-4 h-4" />
                        </button>

                        {/* Export ICS */}
                        <button
                            onClick={() => {
                                const dateStr = format(selectedDate, 'yyyy-MM-dd');
                                window.open(`/api/calendar/export-ics?date=${dateStr}`, '_blank');
                            }}
                            title="Export to Apple/Google Calendar"
                            className="p-2 rounded-lg text-white/40
                            hover:bg-white/[0.06] hover:text-orange-400 transition-all">
                            <Download className="w-4 h-4" />
                        </button>

                        <div className="w-px h-5 bg-white/[0.06] mx-1" />



                        {/* Add Task — minimal CTA */}
                        <button onClick={() => { setAddModalDefaults({}); setShowAddModal(true); }}
                            title="Add a new block"
                            className="p-2 rounded-lg bg-orange-500 text-black hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/15">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Minimal Stats Strip */}
                {viewDayBlocks.length > 0 && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.03]">
                        <span className="text-[10px] text-white/25 font-medium">
                            {dayStats.total} blocks · {dayStats.hours}h
                        </span>
                        <div className="flex-1 h-0.5 bg-white/[0.03] rounded-full overflow-hidden max-w-[160px]">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${dayStats.pct}%` }}
                                className={cn("h-full rounded-full transition-all duration-700",
                                    dayStats.pct >= 70 ? 'bg-emerald-500/70' : dayStats.pct >= 30 ? 'bg-orange-500/70' : 'bg-white/10'
                                )}
                            />
                        </div>
                        <span className={cn("text-[10px] font-bold",
                            dayStats.pct >= 70 ? 'text-emerald-400/70' : dayStats.pct >= 30 ? 'text-orange-400/70' : 'text-white/25'
                        )}>{dayStats.pct}%</span>
                    </div>
                )}
            </div>

            {/* ── Main Content ──────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* Grid Area */}
                <main className="flex-1 overflow-hidden relative">
                    {/* Empty State for Today — only in Day view */}
                    {viewMode === 'day' && !hasScheduleToday && !isLoading && viewDateStr === todayStr && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                        >
                            <div className="pointer-events-auto text-center p-8 rounded-2xl bg-zinc-900/90 border border-white/[0.08]
                                backdrop-blur-xl max-w-sm shadow-2xl">
                                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
                                    <Calendar className="w-7 h-7 text-orange-400" />
                                </div>
                                <h3 className="text-white font-bold text-lg mb-2">No schedule for today</h3>
                                <p className="text-white/40 text-sm mb-5">
                                    Let AI plan your entire day based on your goals, energy, and commitments.
                                </p>
                                <button
                                    onClick={() => handleGenerateToday(todayStr)}
                                    disabled={isGeneratingToday}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold mx-auto
                                        bg-orange-500 text-black hover:bg-orange-400
                                        disabled:opacity-50 disabled:cursor-wait transition-all shadow-lg shadow-orange-500/25"
                                >
                                    {isGeneratingToday ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Planning your day...</>
                                    ) : (
                                        <><Sparkles className="w-4 h-4" /> Plan Today with AI</>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    <WeekGrid
                        date={selectedDate}
                        blocks={blocks}
                        onBlockMove={handleBlockMove}
                        onBlockSelect={setSelectedBlock}
                        onCellClick={handleCellClick}
                        viewMode={viewMode}
                    />
                </main>



                {/* ── Right Sidebar ──────────────────────────────── */}
                <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-l border-white/[0.06] bg-black/40 overflow-y-auto no-scrollbar">
                    <AnimatePresence mode="wait">
                        {selectedBlock ? (
                            <motion.div
                                key="inspector"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="h-full"
                            >
                                <BlockInspector
                                    block={selectedBlock}
                                    onClose={() => setSelectedBlock(null)}
                                    onAction={handleBlockAction}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="sidebar"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="p-4 space-y-6"
                            >
                                {/* Mini Calendar */}
                                <MiniCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

                                {/* Task Categories */}
                                <TaskCategories blocks={viewDayBlocks} />

                                {/* Daily Goal Ring */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider">Daily Goal</h4>
                                    <DailyGoalRing pct={dayStats.pct} />
                                    <p className="text-center text-[10px] text-white/30">
                                        {dayStats.done} of {dayStats.total} tasks completed
                                    </p>
                                </div>

                                {/* Quick Links */}
                                <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                                    <Link href="/app/goals"
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-white/50
                                            hover:bg-white/[0.06] hover:text-white transition-all">
                                        <Target className="w-3.5 h-3.5 text-orange-400" /> Goals
                                    </Link>
                                    <Link href="/app/coach"
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-white/50
                                            hover:bg-white/[0.06] hover:text-white transition-all">
                                        <MessageSquare className="w-3.5 h-3.5 text-orange-400" /> Ask Donna
                                    </Link>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </aside>
            </div>

            {/* ── Modals ────────────────────────────────────────── */}
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

            <AnimatePresence>
                {showPlanWeekModal && (
                    <PlanWeekModal
                        onClose={() => setShowPlanWeekModal(false)}
                        onApply={(opt) => { applyOption(opt); setShowPlanWeekModal(false); }}
                        planWeek={planWeek}
                        context={null}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showOptimizerModal && (
                    <DayOptimizerModal
                        date={selectedDate}
                        onClose={() => setShowOptimizerModal(false)}
                        onApply={(opt) => { applyOption(opt); setShowOptimizerModal(false); }}
                        optimizeDay={optimizeDay}
                    />
                )}
            </AnimatePresence>

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
                    } catch {
                        showToast("Failed to resolve conflict", "error");
                    }
                }}
            />
        </div>
    );
}

// ── Add Block Modal (Orange Theme) ───────────────────────────────
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
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.form
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                onSubmit={handleSubmit}
                className="bg-zinc-900 border border-white/[0.08] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-white font-bold text-lg">Add to Schedule</h2>
                    <div className="flex items-center gap-2 bg-white/[0.06] px-3 py-1.5 rounded-lg">
                        <span className="text-xs font-bold text-white/50">Fixed?</span>
                        <button type="button" onClick={() => setIsAnchor(!isAnchor)}
                            className={cn("w-8 h-4 rounded-full transition-colors relative", isAnchor ? "bg-orange-500" : "bg-white/20")}>
                            <div className={cn("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all",
                                isAnchor ? "left-4" : "left-0.5")} />
                        </button>
                    </div>
                </div>

                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={isAnchor ? "Anchor title (e.g. Gym, Work)" : "Block title..."}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm
                        placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    autoFocus
                />

                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-[10px] uppercase text-white/30 font-bold">Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-white/30 font-bold">Start</label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-white/30 font-bold">End</label>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                </div>

                {goals.length > 0 && !title && (
                    <div className="space-y-1.5">
                        <span className="text-[10px] uppercase text-white/30 font-bold">Quick add from goals:</span>
                        <div className="flex flex-wrap gap-1.5">
                            {goals.slice(0, 5).map((g: any) => (
                                <button key={g.id} type="button" onClick={() => setTitle(g.title)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium
                                        bg-white/[0.06] hover:bg-orange-500/20 text-white/60 hover:text-orange-300 transition-colors">
                                    {g.title}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white/40 hover:text-white hover:bg-white/[0.06] transition-all">
                        Cancel
                    </button>
                    <button type="submit" disabled={!title.trim()}
                        className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                            isAnchor ? "bg-zinc-400 hover:bg-zinc-300" : "bg-orange-500 hover:bg-orange-400")}>
                        {isAnchor ? 'Create Anchor' : 'Add Block'}
                    </button>
                </div>
            </motion.form>
        </motion.div>
    );
}
