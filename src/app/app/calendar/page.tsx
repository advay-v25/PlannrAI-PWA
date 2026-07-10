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
import { PageBackground } from '@/components/ui/PageBackground';
import { CalendarSkeleton } from '@/components/calendar/calendar-skeleton';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';


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
                <span className="text-sm font-bold text-[var(--text-primary)]">{format(viewMonth, 'MMMM yyyy')}</span>
                <div className="flex gap-1">
                    <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1))}
                        className="p-1 rounded hover:bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1))}
                        className="p-1 rounded hover:bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-[10px] font-bold text-[var(--text-tertiary)] py-1">{d}</div>
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
                                isToday ? "bg-[var(--glass-bg)] text-[var(--text-primary)] font-bold ring-1 ring-orange-500/50" :
                                "text-[var(--text-secondary)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
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
                <span className="text-2xl font-black text-[var(--text-primary)]">{pct}%</span>
            </div>
        </div>
    );
}

// ── Weekly Progress Sidebar ──────────────────────────────────────
function WeeklyProgressBar({ blocks, weekStart }: { blocks: any[]; weekStart: Date }) {
    const weekStats = useMemo(() => {
        const weekEnd = addDays(weekStart, 6);
        const ws = format(weekStart, 'yyyy-MM-dd');
        const we = format(weekEnd, 'yyyy-MM-dd');
        const wb = blocks.filter(b =>
            b.date >= ws && b.date <= we &&
            b.block_type !== 'sleep' && b.block_type !== 'meal'
        );
        if (wb.length === 0) return { pct: 0, done: 0, total: 0 };
        const done = wb.filter(b => b.status === 'done').length;
        return { pct: Math.round((done / wb.length) * 100), done, total: wb.length };
    }, [blocks, weekStart]);

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden lg:flex flex-col items-center gap-3 w-11 shrink-0 border-r border-[var(--glass-border)] py-8"
        >
            <span
                className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
            >
                Week
            </span>
            <div className="flex-1 w-1.5 bg-[var(--glass-bg)] rounded-full overflow-hidden relative min-h-[100px]">
                <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${weekStats.pct}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                    className="absolute bottom-0 left-0 right-0 rounded-full"
                    style={{ background: 'linear-gradient(to top, hsla(158, 76%, 50%, 1), hsla(158, 76%, 50%, 0.35))' }}
                />
            </div>
            <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-bold text-[var(--text-secondary)]">{weekStats.pct}%</span>
                <span className="text-[8px] text-[var(--text-tertiary)] font-medium">{weekStats.done}/{weekStats.total}</span>
            </div>
        </motion.div>
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
            <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Tasks</h4>
            {categories.map(([type, { count, color }]) => (
                <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2.5 h-2.5 rounded-sm", color)} />
                        <span className="text-xs text-[var(--text-secondary)] capitalize">{type.replace('_', ' ')}</span>
                    </div>
                    <span className="text-xs font-bold text-[var(--text-primary)] dark:text-white/80">{count}</span>
                </div>
            ))}
        </div>
    );
}

// ── Main Calendar Page ───────────────────────────────────────────
export default function CalendarPage() {
    return (
        <Suspense fallback={<CalendarSkeleton />}>
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
    const [showMiniCalendar, setShowMiniCalendar] = useState(false);
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
        if (setupComplete === 'complete' && !autoPlanned) {
            setAutoPlanned(true);
            showToast('✅ Your week plan is ready!', 'success');
            // Clean up URL param
            const url = new URL(window.location.href);
            url.searchParams.delete('setup');
            window.history.replaceState({}, '', url);
            // Switch to week view to show the full plan
            setViewMode('week');
            refresh();
        }
        
        const action = searchParams.get('action');
        if (action === 'optimize_day') {
            setShowOptimizerModal(true);
            // optionally clean up URL
            const url = new URL(window.location.href);
            url.searchParams.delete('action');
            window.history.replaceState({}, '', url);
        }
    }, [searchParams, autoPlanned]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep selectedBlock in sync with latest block data after refreshes
    useEffect(() => {
        if (!selectedBlock) return;
        const updated = blocks.find(b => b.id === selectedBlock.id);
        if (updated) setSelectedBlock(updated);
    }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps

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
            const res = await apiClient.post<any>('/api/calendar/generate-today', { date: targetDate, force: true, mode: 'balanced' });
            
            if (!res.success) {
                throw new Error(res.error?.message || 'Failed to generate plan');
            }
            const planData = res.data;
            const options = planData.options || [];
            if (options.length === 0) {
                showToast('No schedule generated. Add goals first.', 'error');
                return;
            }
            const firstOption = options[0];
            const ops = firstOption.patch?.ops || [];
            const addBlocks = ops
                .filter((o: any) => o.op === 'create_event' || o.op === 'create')
                .map((o: any) => o.payload || o.event || {});

            const applyRes = await apiClient.post<any>('/api/calendar/apply-schedule', {
                action: 'optimize_day',
                clear_date: targetDate,
                patch: { add: addBlocks },
            });
            
            if (!applyRes.success) throw new Error(applyRes.error?.message || 'Failed to apply schedule');
            
            const added = applyRes.data?.added || addBlocks.length;
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
                    await apiClient.schedule.updateBlockStatus({
                        block_id: selectedBlock.id,
                        status: 'done'
                    });
                    showToast("✅ Block completed", 'success');
                    break;
                case 'skip':
                    await apiClient.schedule.updateBlockStatus({
                        block_id: selectedBlock.id,
                        status: 'missed'
                    });
                    showToast("Marked incomplete", 'info');
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
        } catch (e: any) {
            showToast(e?.message || "Action failed", 'error');
        }
    };

    const handleCellClick = (date: string, hour: number) => {
        setAddModalDefaults({ date, hour });
        setShowAddModal(true);
    };

    const handleAddBlock = async (data: { title: string; date: string; start_time: string; end_time: string; isAnchor?: boolean; isLocked?: boolean }) => {
        if (data.isAnchor) {
            await createCommitment(data);
        } else {
            await addBlock({ title: data.title, context: data.title, date: data.date, start_time: data.start_time, end_time: data.end_time, is_locked: data.isLocked });
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
        return <CalendarSkeleton />;
    }

    // ── Date title ───────────────────────────────────────────────
    const dateTitle = viewMode === 'week'
        ? `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
        : format(selectedDate, 'MMMM d, yyyy');
    return (
        <div className="h-full w-full bg-transparent text-[var(--text-primary)] overflow-hidden flex flex-col relative">
            {/* Dark-only overlay (removed for light mode to show ambient glows) */}
            <div className="absolute inset-0 hidden dark:block bg-gradient-to-b from-black/60 via-black/80 to-[#050508] pointer-events-none -z-10" />
            <PageBackground color="teal" variant="horizon" intensity="medium" />

            {/* ── Top Header ────────────────────────────────────── */}
            <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl">
                <div className="flex items-center justify-between">
                    {/* Left: Nav + Date */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-0.5">
                            <button onClick={() => navigateDate(-1)}
                                className="p-1.5 rounded-lg hover:bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button onClick={() => setSelectedDate(new Date())}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] dark:hover:bg-white/8 transition-colors uppercase tracking-wider">
                                Today
                            </button>
                            <button onClick={() => navigateDate(1)}
                                className="p-1.5 rounded-lg hover:bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="relative">
                            <button 
                                onClick={() => setShowMiniCalendar(!showMiniCalendar)} 
                                className="text-sm font-semibold text-[var(--text-secondary)] tracking-tight hover:text-[var(--text-primary)] transition-colors cursor-pointer select-none"
                            >
                                {dateTitle}
                            </button>
                            <AnimatePresence>
                                {showMiniCalendar && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowMiniCalendar(false)} />
                                        <motion.div 
                                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                            transition={{ duration: 0.15, ease: "easeOut" }}
                                            className="absolute top-full left-0 mt-2 z-50 origin-top-left"
                                        >
                                            <MiniCalendar 
                                                selectedDate={selectedDate} 
                                                onSelectDate={(d) => { setSelectedDate(d); setShowMiniCalendar(false); }} 
                                            />
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Right: Compact Actions */}
                    <div className="flex items-center gap-1.5">
                        {/* View Toggle */}
                        <div className="flex bg-[var(--glass-bg)] rounded-lg p-0.5 mr-1">
                            <button onClick={() => setViewMode('day')}
                                className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                                    viewMode === 'day' ? "bg-orange-500 text-black" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]")}>
                                Day
                            </button>
                            <button onClick={() => setViewMode('week')}
                                className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                                    viewMode === 'week' ? "bg-orange-500 text-black" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]")}>
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
                        <LiquidGlassButton
                            onClick={() => setShowOptimizerModal(true)}
                            title="Optimize today's schedule with AI"
                            variant="primary"
                            size="sm"
                            className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 overflow-hidden group"
                        >
                            <Zap className="w-3.5 h-3.5 group-hover:text-amber-300 transition-colors" />
                            <span className="hidden sm:inline text-xs font-bold">Optimize</span>
                        </LiquidGlassButton>

                        {/* AI: Plan Week */}
                        <LiquidGlassButton
                            onClick={() => setShowPlanWeekModal(true)}
                            title="Plan your entire week with AI"
                            variant="primary"
                            size="sm"
                            className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 overflow-hidden group"
                        >
                            <Layout className="w-3.5 h-3.5 group-hover:text-blue-300 transition-colors" />
                            <span className="hidden sm:inline text-xs font-bold">Plan Week</span>
                        </LiquidGlassButton>

                        {/* Export ICS */}
                        <button
                            onClick={() => {
                                const dateStr = format(selectedDate, 'yyyy-MM-dd');
                                window.open(`/api/calendar/export-ics?date=${dateStr}`, '_blank');
                            }}
                            title="Export to Apple/Google Calendar"
                            className="p-2 rounded-lg text-[var(--text-tertiary)]
                            hover:bg-[var(--glass-bg)] hover:text-orange-400 transition-all">
                            <Download className="w-4 h-4" />
                        </button>

                        <div className="w-px h-5 bg-[var(--glass-bg)] mx-1" />



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
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--glass-border)] dark:border-white/[0.03]">
                        <span className="text-[10px] text-[var(--text-tertiary)] font-medium">
                            {dayStats.total} blocks · {dayStats.hours}h
                        </span>
                        <div className="flex-1 h-0.5 bg-[var(--glass-bg)] rounded-full overflow-hidden max-w-[160px]">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${dayStats.pct}%` }}
                                className={cn("h-full rounded-full transition-all duration-700",
                                    dayStats.pct >= 70 ? 'bg-emerald-500/70' : dayStats.pct >= 30 ? 'bg-orange-500/70' : 'bg-[var(--glass-bg)]'
                                )}
                            />
                        </div>
                        <span className={cn("text-[10px] font-bold",
                            dayStats.pct >= 70 ? 'text-emerald-400/70' : dayStats.pct >= 30 ? 'text-orange-400/70' : 'text-[var(--text-tertiary)]'
                        )}>{dayStats.pct}%</span>
                    </div>
                )}
            </div>

            {/* ── Main Content ──────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* Weekly progress bar — left of grid */}
                <WeeklyProgressBar blocks={blocks} weekStart={weekStart} />

                {/* Grid Area */}
                <main className="flex-1 overflow-hidden relative">
                    {/* Empty State for Day view (any empty day) */}
                    {viewMode === 'day' && viewDayBlocks.length === 0 && !isLoading && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                        >
                            <div className="pointer-events-auto text-center p-8 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                backdrop-blur-xl max-w-sm shadow-2xl">
                                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
                                    <Calendar className="w-7 h-7 text-orange-400" />
                                </div>
                                <h3 className="text-[var(--text-primary)] font-bold text-lg mb-2">No schedule for {viewDateStr === todayStr ? 'today' : 'this day'}</h3>
                                <p className="text-[var(--text-tertiary)] text-sm mb-5">
                                    Let AI plan your entire day based on your goals, energy, and commitments.
                                </p>
                                <LiquidGlassButton
                                    onClick={() => handleGenerateToday(viewDateStr)}
                                    disabled={isGeneratingToday}
                                    variant="primary"
                                    size="md"
                                    className="mx-auto"
                                >
                                    {isGeneratingToday ? (
                                        <><div className="w-4 h-4 rounded-full border-2 border-[var(--text-muted)] border-t-[var(--text-primary)] dark:border-t-white animate-spin" /> Planning...</>
                                    ) : (
                                        <><Sparkles className="w-4 h-4" /> Plan {viewDateStr === todayStr ? 'Today' : 'This Day'} with AI</>
                                    )}
                                </LiquidGlassButton>
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



                {/* ── Right Sidebar (Inspector Only) ─────────────── */}
                <AnimatePresence>
                    {selectedBlock && (
                        <>
                            {/* Desktop Inspector */}
                            <motion.aside
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 320, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="hidden lg:flex flex-col shrink-0 border-l border-[var(--glass-border)] bg-[var(--glass-bg)] overflow-y-auto no-scrollbar"
                            >
                                <div className="w-[320px] h-full">
                                    <BlockInspector
                                        block={selectedBlock}
                                        onClose={() => setSelectedBlock(null)}
                                        onAction={handleBlockAction}
                                    />
                                </div>
                            </motion.aside>

                            {/* Mobile Inspector Bottom Sheet */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-40 bg-[var(--glass-bg)] backdrop-blur-sm lg:hidden"
                                onClick={() => setSelectedBlock(null)}
                            />
                            <motion.div
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl lg:hidden bg-[var(--color-bg-primary)] border-t border-[var(--glass-border)]"
                            >
                                <BlockInspector
                                    block={selectedBlock}
                                    onClose={() => setSelectedBlock(null)}
                                    onAction={handleBlockAction}
                                />
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
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
    onSubmit: (data: { title: string; date: string; start_time: string; end_time: string; isAnchor: boolean; isLocked: boolean }) => void;
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
    const [isLocked, setIsLocked] = useState(true);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSubmit({ title: title.trim(), date, start_time: startTime, end_time: endTime, isAnchor, isLocked });
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
                className="bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-[var(--text-primary)] font-bold text-lg">Add to Schedule</h2>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-[var(--glass-bg)] px-3 py-1.5 rounded-lg">
                            <span className="text-xs font-bold text-[var(--text-secondary)]">Recur Weekly?</span>
                            <button type="button" onClick={() => setIsAnchor(!isAnchor)}
                                className={cn("w-8 h-4 rounded-full transition-colors relative", isAnchor ? "bg-orange-500" : "bg-[var(--glass-bg)] dark:bg-white/20")}>
                                <div className={cn("w-3 h-3 bg-[var(--text-primary)] dark:bg-white rounded-full absolute top-0.5 transition-all",
                                    isAnchor ? "left-4" : "left-0.5")} />
                            </button>
                        </div>
                        {!isAnchor && (
                            <div className="flex items-center gap-2 bg-[var(--glass-bg)] px-3 py-1.5 rounded-lg">
                                <span className="text-xs font-bold text-[var(--text-secondary)]">Locked?</span>
                                <button type="button" onClick={() => setIsLocked(!isLocked)}
                                    className={cn("w-8 h-4 rounded-full transition-colors relative", isLocked ? "bg-orange-500" : "bg-[var(--glass-bg)] dark:bg-white/20")}>
                                    <div className={cn("w-3 h-3 bg-[var(--text-primary)] dark:bg-white rounded-full absolute top-0.5 transition-all",
                                        isLocked ? "left-4" : "left-0.5")} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={isAnchor ? "Anchor title (e.g. Gym, Work)" : "Block title..."}
                    className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-3 text-[var(--text-primary)] text-sm
                        placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    autoFocus
                />

                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">Start</label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                            className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">End</label>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                            className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm" />
                    </div>
                </div>

                {goals.length > 0 && !title && (
                    <div className="space-y-1.5">
                        <span className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">Quick add from goals:</span>
                        <div className="flex flex-wrap gap-1.5">
                            {goals.slice(0, 5).map((g: any) => (
                                <button key={g.id} type="button" onClick={() => setTitle(g.title)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium
                                        bg-[var(--glass-bg)] hover:bg-orange-500/20 text-[var(--text-secondary)] hover:text-orange-300 transition-colors">
                                    {g.title}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all">
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
