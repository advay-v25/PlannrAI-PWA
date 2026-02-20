'use client';

import { useState } from 'react';
import { useCalendar } from '@/hooks/use-calendar';
import { CalendarLayout } from '@/components/calendar/calendar-layout';
import { apiClient } from '@/lib/api-client';
import { WeekGrid } from '@/components/calendar/week-grid';
import { BlockInspector } from '@/components/calendar/block-inspector';
import { useToast } from '@/components/ui/toast';
import {
    Loader2, ChevronLeft, ChevronRight, Plus, Zap, Layout, RotateCcw,
    Sparkles, X, Calendar as CalendarIcon
} from 'lucide-react';
import { format, startOfWeek, addWeeks, subWeeks, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ConflictModal } from '@/components/calendar/conflict-modal';

export default function CalendarPage() {
    const {
        selectedDate,
        setSelectedDate,
        blocks,
        goals,
        isLoading,
        addBlock,
        moveBlock,
        updateBlock,
        deleteBlock,
        refresh,
        planWeek,
        optimizeDay,
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
    const [planMode, setPlanMode] = useState<'balanced' | 'intense' | 'recovery'>('balanced');
    const [showPlanOptions, setShowPlanOptions] = useState(false);

    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });

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

    const handleAddBlock = async (data: { title: string; date: string; start_time: string; end_time: string }) => {
        await addBlock({
            context: data.title,
            date: data.date,
            start_time: data.start_time,
            end_time: data.end_time
        });
        setShowAddModal(false);
    };

    const handlePlanWeek = async (mode: 'balanced' | 'intense' | 'recovery') => {
        setShowPlanOptions(false);
        await planWeek({ mode, allow_weekend: false });
    };

    // --- Loading ---
    if (isLoading && blocks.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white/50 gap-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Calendar...</span>
            </div>
        );
    }

    // --- Header / Action Bar ---
    const header = (
        <div className="flex items-center justify-between gap-4 flex-wrap">
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

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                {/* Undo */}
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

                {/* Add Block */}
                <button
                    onClick={() => { setAddModalDefaults({}); setShowAddModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                        bg-white/5 border border-white/10 text-white/60
                        hover:bg-white/10 hover:text-white transition-all"
                >
                    <Plus className="w-3.5 h-3.5" /> Block
                </button>

                {/* Optimize Day */}
                <button
                    onClick={() => optimizeDay()}
                    disabled={isOptimizing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                        bg-emerald-500/10 border border-emerald-500/20 text-emerald-400
                        hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
                >
                    {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Optimize Day
                </button>

                {/* Plan Week */}
                <div className="relative">
                    <button
                        onClick={() => setShowPlanOptions(!showPlanOptions)}
                        disabled={isPlanning}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                            bg-violet-500/10 border border-violet-500/20 text-violet-400
                            hover:bg-violet-500/20 disabled:opacity-50 transition-all"
                    >
                        {isPlanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layout className="w-3.5 h-3.5" />}
                        Plan Week
                    </button>

                    <AnimatePresence>
                        {showPlanOptions && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="absolute right-0 top-full mt-1 bg-black/90 border border-white/10 rounded-xl p-1 z-50 min-w-[140px] shadow-2xl backdrop-blur-xl"
                            >
                                {([
                                    { mode: 'balanced', label: 'Balanced', desc: 'Even distribution' },
                                    { mode: 'intense', label: 'Intense', desc: 'Max productivity' },
                                    { mode: 'recovery', label: 'Recovery', desc: 'Light schedule' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.mode}
                                        onClick={() => handlePlanWeek(opt.mode)}
                                        className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-white/10 transition-colors"
                                    >
                                        <div className="font-bold text-white">{opt.label}</div>
                                        <div className="text-[10px] text-white/40">{opt.desc}</div>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );

    return (
        <div className="h-screen bg-black text-white overflow-hidden">
            <CalendarLayout
                showInspector={!!selectedBlock}
                header={header}
                weekGrid={
                    <WeekGrid
                        date={selectedDate}
                        blocks={blocks}
                        onBlockMove={handleBlockMove}
                        onBlockSelect={setSelectedBlock}
                        onCellClick={handleCellClick}
                    />
                }
                inspector={
                    <BlockInspector
                        block={selectedBlock}
                        onClose={() => setSelectedBlock(null)}
                        onAction={handleBlockAction}
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

            {/* Conflict Resolution Modal */}
            <ConflictModal
                error={conflictError}
                onClose={dismissConflict}
                onConfirmOption={async (opt) => {
                    dismissConflict();
                    // If backend returned a token or we need to apply the patch, we handle it here
                    // For now, since ConflictService is just deterministic, if user selects an option
                    // we re-submit the action but with the `resolution_strategy` flag.
                    try {
                        if (conflictError?.pendingAction) {
                            const { type, payload } = conflictError.pendingAction;
                            if (type === 'create') {
                                await apiClient.schedule.createBlock({ ...payload, resolution_strategy: opt.strategy });
                            } else if (type === 'move') {
                                await apiClient.schedule.moveBlock(payload.id, payload.newDate, payload.newStart, payload.newEnd, opt.strategy);
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
    onSubmit: (data: { title: string; date: string; start_time: string; end_time: string }) => void;
    onClose: () => void;
}) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const defaultHour = defaults.hour || 9;

    const [title, setTitle] = useState('');
    const [date, setDate] = useState(defaults.date || today);
    const [startTime, setStartTime] = useState(`${defaultHour.toString().padStart(2, '0')}:00`);
    const [endTime, setEndTime] = useState(`${(defaultHour + 1).toString().padStart(2, '0')}:00`);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSubmit({ title: title.trim(), date, start_time: startTime, end_time: endTime });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-black/90 border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white">Add Block</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/40">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1 block">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="What are you working on?"
                            autoFocus
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white
                                placeholder:text-white/20 focus:outline-none focus:border-[var(--color-primary)]/40"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1 block">Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white
                                focus:outline-none focus:border-[var(--color-primary)]/40 [color-scheme:dark]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1 block">Start</label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white
                                    focus:outline-none focus:border-[var(--color-primary)]/40 [color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1 block">End</label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white
                                    focus:outline-none focus:border-[var(--color-primary)]/40 [color-scheme:dark]"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={!title.trim()}
                        className="w-full py-3 rounded-xl font-bold text-sm text-white
                            bg-[var(--color-primary)] hover:brightness-110 active:scale-[0.98]
                            disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        Add Block
                    </button>
                </form>
            </motion.div>
        </motion.div>
    );
}
