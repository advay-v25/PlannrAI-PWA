'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes } from 'date-fns';
import { DndContext, useDraggable, useDroppable, DragEndEvent, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Lock, Check, Plus } from 'lucide-react';
import { calculateLayout, LayoutBlock } from '@/lib/calendar-layout';
import { motion } from 'framer-motion';
import { usePremiumCalendar } from './premium-calendar-styles';

interface WeekGridProps {
    date: Date;
    blocks: any[];
    onBlockMove: (id: string, newDate: string, newStart: string, newEnd: string) => void;
    onBlockSelect: (block: any) => void;
    onCellClick?: (date: string, hour: number) => void;
    viewMode?: 'day' | 'week';
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am - 11pm
const CELL_HEIGHT = 120;

// Pillar colors using CSS variables for consistency across pages.
//
// Two distinct visual treatments by category:
//  - Fixed/structural blocks (anchor/meal/sleep) stay FILLED and translucent
//    — a layered "satin" wash (diagonal glass-sheen over a color tint) plus
//    a solid 3px accent stripe on the leading edge, so these read as solid,
//    settled parts of the day.
//  - Planned/goal blocks (mind/body/craft/default) are outline-first: a
//    neutral glass background with NO pillar-colored fill, and a thicker,
//    stronger-opacity border carrying the pillar identity instead — this
//    keeps the grid calmer at a glance (a week full of solid-colored tiles
//    reads as "jarring") while a thick, well-defined outline is still
//    unambiguous per pillar, especially against the border-only lookalikes.
//
// IMPORTANT: these must be fully-literal strings, not built via template
// interpolation of a color variable — Tailwind's build-time scanner only
// picks up class names it can find as literal text in the source, so a
// helper like `` `border-[${cssVar}]/55` `` would silently compile to
// nothing. Also note `var(--x)/NN` opacity shorthand only works on
// Tailwind's own color utilities (e.g. `border-[var(--x)]/55`) — inside a
// raw arbitrary `[background:...]` property it is NOT valid CSS and
// silently drops the whole declaration, so those use color-mix() instead
// (the same technique Tailwind itself compiles that shorthand down to).
const PILLAR_COLORS: Record<string, { bg: string; border: string; borderWidth: string; text: string; metaText: string; dot: string; glow: string; edge: string }> = {
    // A full-perimeter saturated color ring around a near-white card reads
    // as a coloring-book sticker, not a premium app — so every block type
    // now shares the SAME thin, mostly-neutral border, and each pillar's
    // color is demoted to a single restrained left accent stripe (the same
    // convention Google Calendar/Notion Calendar/Fantastical use), plus a
    // subtle top-highlight/bottom-shade bevel and a tight outer glow for
    // depth. One consistent border language across all types = "unified";
    // color as an accent rather than an outline = "clean" instead of loud.
    mind: {
        bg: 'bg-[var(--glass-bg)] dark:bg-white/[0.04]',
        border: 'border-[var(--glass-border)] dark:border-white/10',
        borderWidth: 'border',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-mind)] dark:bg-[var(--color-mind)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-mind)_40%,_black),0_0_10px_-5px_var(--color-mind-glow)] dark:shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-mind)_40%,_black),0_0_12px_-5px_var(--color-mind-glow)]',
        glow: 'block-glow-mind dark:block-glow-mind',
    },
    body: {
        bg: 'bg-[var(--glass-bg)] dark:bg-white/[0.04]',
        border: 'border-[var(--glass-border)] dark:border-white/10',
        borderWidth: 'border',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-body)] dark:bg-[var(--color-body)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-body),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-body)_40%,_black),0_0_10px_-5px_var(--color-body-glow)] dark:shadow-[inset_3px_0_0_0_var(--color-body),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-body)_40%,_black),0_0_12px_-5px_var(--color-body-glow)]',
        glow: 'block-glow-body dark:block-glow-body',
    },
    craft: {
        bg: 'bg-[var(--glass-bg)] dark:bg-white/[0.04]',
        border: 'border-[var(--glass-border)] dark:border-white/10',
        borderWidth: 'border',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-craft)] dark:bg-[var(--color-craft)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-craft),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-craft)_40%,_black),0_0_10px_-5px_var(--color-craft-glow)] dark:shadow-[inset_3px_0_0_0_var(--color-craft),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-craft)_40%,_black),0_0_12px_-5px_var(--color-craft-glow)]',
        glow: 'block-glow-craft dark:block-glow-craft',
    },
    anchor: {
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.4)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_rgba(113,113,122,0.30)_0%,_rgba(113,113,122,0.14)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.08)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_rgba(113,113,122,0.24)_0%,_rgba(113,113,122,0.10)_100%)]',
        border: 'border-[var(--glass-border)] dark:border-white/10',
        borderWidth: 'border',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-zinc-500 dark:bg-zinc-500',
        edge: 'shadow-[inset_3px_0_0_0_rgba(113,113,122,0.9),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_rgba(63,63,70,0.35),0_0_10px_-5px_rgba(113,113,122,0.3)] dark:shadow-[inset_3px_0_0_0_rgba(113,113,122,0.7),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_rgba(0,0,0,0.4),0_0_12px_-5px_rgba(113,113,122,0.25)]',
        glow: 'block-glow-anchor dark:block-glow-anchor',
    },
    meal: {
        // Slate/steel scheme sleep used to have — swapped so sleep can own
        // the blue metallic identity below.
        bg: 'bg-slate-400/35 dark:bg-[var(--glass-bg)]',
        border: 'border-[var(--glass-border)] dark:border-white/10',
        borderWidth: 'border',
        text: 'text-[var(--text-primary)] dark:text-[var(--text-tertiary)]',
        metaText: 'text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]',
        dot: 'bg-slate-500 dark:bg-slate-400',
        edge: 'shadow-[inset_3px_0_0_0_rgba(100,116,139,0.9),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_rgba(51,65,85,0.3),0_0_10px_-5px_rgba(100,116,139,0.35)] dark:shadow-[inset_3px_0_0_0_rgba(148,163,184,0.7),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_rgba(0,0,0,0.4),0_0_12px_-5px_rgba(148,163,184,0.3)]',
        glow: 'block-glow-meal dark:block-glow-meal',
    },
    sleep: {
        // New blue metallic identity (previously plain slate/gray).
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.55)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-sleep)_36%,_transparent)_0%,_color-mix(in_oklab,_var(--color-sleep)_16%,_transparent)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.10)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-sleep)_16%,_transparent)_0%,_color-mix(in_oklab,_var(--color-sleep)_7%,_transparent)_100%)]',
        border: 'border-[var(--glass-border)] dark:border-white/10',
        borderWidth: 'border',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-sleep)] dark:bg-[var(--color-sleep)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-sleep),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_rgba(30,58,138,0.3),0_0_10px_-5px_var(--color-sleep-glow)] dark:shadow-[inset_3px_0_0_0_var(--color-sleep),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_rgba(0,0,0,0.4),0_0_12px_-5px_var(--color-sleep-glow)]',
        glow: 'block-glow-sleep dark:block-glow-sleep',
    },
    break: {
        bg: 'bg-transparent dark:bg-transparent',
        border: 'border-[var(--glass-border)]',
        borderWidth: 'border',
        text: 'text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]',
        metaText: 'text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]',
        dot: 'bg-zinc-400 dark:bg-white/20',
        glow: '',
        edge: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]',
    },
    default: {
        bg: 'bg-[var(--glass-bg)] dark:bg-white/[0.04]',
        border: 'border-[var(--glass-border)] dark:border-white/10',
        borderWidth: 'border',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-mind)] dark:bg-[var(--color-mind)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-mind)_40%,_black),0_0_10px_-5px_var(--color-mind-glow)] dark:shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-mind)_40%,_black),0_0_12px_-5px_var(--color-mind-glow)]',
        glow: 'block-glow-mind dark:block-glow-mind',
    },
};

// Some meals (e.g. a user-defined recurring "Breakfast" set up the same way
// as a fixed commitment like "College") get created via the commitments/
// anchor path rather than the AI meal generator, storing them as block_type
// 'anchor' instead of 'meal' — but they should still read visually as a
// meal, not collapse into the generic gray anchor treatment used for actual
// fixed commitments. Match on title so this only catches genuine meals.
const MEAL_TITLE_PATTERN = /^(breakfast|lunch|dinner|snack)s?$/i;

function getBlockColors(block: any) {
    // block_type identity takes priority over lock status — a locked meal
    // (e.g. a protected breakfast slot) must still read as a meal block, not
    // collapse into the generic gray anchor treatment. Only truly
    // uncategorized locked blocks fall back to anchor styling.
    if (block.block_type === 'meal' || (block.block_type === 'anchor' && MEAL_TITLE_PATTERN.test((block.title || '').trim()))) {
        return PILLAR_COLORS.meal;
    }
    if (block.block_type === 'anchor') return PILLAR_COLORS.anchor;
    if (block.block_type === 'sleep') return PILLAR_COLORS.sleep;
    if (block.block_type === 'break' || block.block_type === 'buffer') return PILLAR_COLORS.break;
    if (block.is_locked) return PILLAR_COLORS.anchor;
    const pillar = (block.goal?.category || block.goal?.pillar || block.pillar || '').toLowerCase();
    return PILLAR_COLORS[pillar] || PILLAR_COLORS.default;
}

const STATUS_STYLES: Record<string, string> = {
    done: 'opacity-60 saturate-50',
    missed: 'opacity-40 saturate-0',
    cancelled: 'opacity-25 saturate-0 line-through',
};

export function WeekGrid({ date, blocks, onBlockMove, onBlockSelect, onCellClick, viewMode = 'week' }: WeekGridProps) {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const days = viewMode === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
        : [date]; // Day view = single column
    const gridRef = useRef<HTMLDivElement>(null);

    // Current time marker
    const [nowTop, setNowTop] = useState(0);
    const [nowDayIndex, setNowDayIndex] = useState(-1);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const minutes = now.getHours() * 60 + now.getMinutes();
            setNowTop(((minutes - 6 * 60) / 60) * CELL_HEIGHT);
            const idx = days.findIndex(d => isSameDay(d, now));
            setNowDayIndex(idx);
        };
        updateTime();
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, [days]);

    // Auto-scroll to current time and today's column on mount
    const scrolledRef = useRef(false);
    useEffect(() => {
        if (gridRef.current && nowTop > 0 && nowDayIndex >= 0 && !scrolledRef.current) {
            let left = 0;
            if (viewMode === 'week' && nowDayIndex > 0) {
                 left = Math.max(0, 56 + (nowDayIndex * 110) - 60);
            }
            gridRef.current.scrollTo({ top: Math.max(0, nowTop - 200), left, behavior: 'smooth' });
            scrolledRef.current = true;
        }
    }, [nowTop, nowDayIndex, viewMode]);

    // Pre-compute layout per day
    const dayLayouts = useMemo(() => {
        const layouts = new Map<number, Map<string, LayoutBlock>>();
        days.forEach((day, i) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayBlocks = blocks.filter(b => b.date === dayStr);
            layouts.set(i, calculateLayout(dayBlocks, CELL_HEIGHT));
        });
        return layouts;
    }, [blocks, days]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const block = blocks.find(b => b.id === active.id);
        if (!block) return;

        const parts = (over.id as string).split('-');
        const dayIndex = parseInt(parts[1]);
        const hour = parseInt(parts[2]);
        const targetDate = format(days[dayIndex], 'yyyy-MM-dd');

        // Snap to the nearest 15 min based on where within the hour cell the
        // block was actually dropped — previously this always reset to :00
        // regardless of drop position, so small in-hour nudges were silent
        // no-ops and crossing a cell boundary always jumped a full 60 min.
        const activeRect = active.rect.current.translated;
        const overRect = over.rect;
        let snappedMinutes = 0;
        if (activeRect && overRect) {
            const offsetPx = activeRect.top - overRect.top;
            const minutesWithinHour = (offsetPx / CELL_HEIGHT) * 60;
            snappedMinutes = Math.min(45, Math.max(0, Math.round(minutesWithinHour / 15) * 15));
        }

        const duration = differenceInMinutes(
            new Date(`2000-01-01T${block.end_time}`),
            new Date(`2000-01-01T${block.start_time}`)
        );

        // Plain minute-of-day math instead of round-tripping through Date
        // objects — the old Date-based approach silently rolled past
        // midnight into "00:30" for a drop near the end of the day, producing
        // an end time earlier than the start time on the same date. Clamp
        // to 23:59 instead since blocks don't span across midnight.
        const startTotalMinutes = hour * 60 + snappedMinutes;
        const endTotalMinutes = Math.min(23 * 60 + 59, startTotalMinutes + duration);
        const toHHMM = (totalMinutes: number) =>
            `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
        const targetStart = toHHMM(startTotalMinutes);
        const targetEnd = toHHMM(endTotalMinutes);

        // Skip if the block would land back in the exact slot it started
        // in — `active.id !== over.id` used to guard this but can never be
        // false (a block id and a "cell-x-y" id never match), so it never
        // actually caught a no-op drop and fired an unnecessary API call.
        if (block.date === targetDate && block.start_time === targetStart) return;

        onBlockMove(active.id as string, targetDate, targetStart, targetEnd);
    };

    // MouseSensor (not PointerSensor) alongside TouchSensor: PointerSensor
    // also fires for touch pointer events, which raced against TouchSensor's
    // 250ms long-press delay and could win the "is this a drag or a scroll"
    // decision — causing accidental drags when a user tried to scroll the
    // grid on mobile. Splitting mouse and touch onto dedicated sensors
    // removes that race entirely.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
    );

    return (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
            <div className={cn("h-full relative no-scrollbar overscroll-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]", viewMode === 'day' ? "overflow-y-auto overflow-x-hidden" : "overflow-auto")} ref={gridRef}>
                <div className="calendar-galaxy-bg" />

                {/* Day Headers */}
                <div className="sticky top-0 z-20 flex border-b border-[var(--glass-border)] bg-[var(--color-bg-primary)] shadow-lg">
                    <div className="w-14 shrink-0 sticky left-0 z-30 bg-[var(--color-bg-primary)] border-r border-[var(--glass-border)]" />
                    {days.map((day, i) => {
                        const isToday = isSameDay(day, new Date());
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const dayBlocks = blocks.filter(b => b.date === dayStr);
                        const done = dayBlocks.filter(b => b.status === 'done').length;
                        return (
                            <div key={i} className={cn(
                                "flex-1 text-center py-3 border-r border-[var(--glass-border)] last:border-r-0 transition-colors relative",
                                viewMode === 'day' ? 'min-w-0 max-w-full' : 'min-w-[110px]'
                            )}>
                                <div className="flex flex-col items-center gap-1">
                                    <div className={cn(
                                        "text-[10px] uppercase font-bold tracking-widest",
                                        isToday ? "text-orange-400" : "text-[var(--text-tertiary)]"
                                    )}>
                                        {format(day, 'EEE')}
                                    </div>
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-inner",
                                        isToday ? "bg-gradient-to-tr from-orange-500/80 to-purple-500/80 text-white dark:text-[var(--text-primary)] backdrop-blur-md border border-white/40 dark:border-white/30 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]"
                                    )}>
                                        {format(day, 'd')}
                                    </div>
                                    {dayBlocks.length > 0 && (
                                        <div className="text-[9px] text-[var(--text-tertiary)] font-mono">
                                            <span className={done === dayBlocks.length ? "text-emerald-400/80 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" : ""}>
                                                {done}/{dayBlocks.length}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Grid Body */}
                <div className="flex relative" style={{ minHeight: HOURS.length * CELL_HEIGHT }}>

                    {/* Time Column */}
                    <div className="w-14 shrink-0 sticky left-0 z-10 bg-[var(--color-bg-primary)] border-r border-[var(--glass-border)]">
                        {HOURS.map(h => (
                            <div key={h} className="border-b border-dashed border-[var(--glass-border)] text-[10px] text-[var(--text-tertiary)] text-right pr-2 pt-1 font-mono"
                                style={{ height: CELL_HEIGHT }}>
                                {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    {days.map((day, dayIndex) => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const dayBlocks = blocks.filter(b => b.date === dayStr);
                        const layoutMap = dayLayouts.get(dayIndex) || new Map();
                        const isToday = isSameDay(day, new Date());
                        const isPast = day < new Date(new Date().setHours(0,0,0,0));

                        return (
                            <div key={dayIndex} className={cn(
                                "flex-1 border-r border-[var(--glass-border)] last:border-r-0 relative transition-colors",
                                viewMode === 'day' ? 'min-w-0 max-w-full' : 'min-w-[110px]',
                                isToday && "bg-[var(--glass-bg)]",
                                isPast && "bg-[var(--glass-bg)] opacity-80"
                            )}>
                                {/* Hour Droppables */}
                                {HOURS.map(h => (
                                    <DroppableHour
                                        key={h}
                                        dayIndex={dayIndex}
                                        hour={h}
                                        onClick={() => onCellClick?.(format(day, 'yyyy-MM-dd'), h)}
                                    />
                                ))}

                                {/* Block Overlays */}
                                {dayBlocks.map((block, index) => {
                                    const layout = layoutMap.get(block.id);
                                    if (!layout) return null;
                                    const adjustedLayout = {
                                        ...layout,
                                        top: layout.top - (6 * CELL_HEIGHT)
                                    };
                                    return (
                                        <BlockCard
                                            key={block.id}
                                            block={block}
                                            layout={adjustedLayout}
                                            onClick={() => onBlockSelect(block)}
                                            isDayView={viewMode === 'day'}
                                            index={index}
                                        />
                                    );
                                })}

                                {/* Current Time Line — gradient */}
                                {dayIndex === nowDayIndex && nowTop > 0 && (
                                    <div
                                        className="absolute left-[-56px] right-0 z-30 pointer-events-none flex items-center"
                                        style={{ top: nowTop - 6 }}
                                    >
                                        <div className="w-14 text-[10px] text-orange-600 dark:text-orange-400 font-bold text-right pr-2 shrink-0 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]">
                                            {format(new Date(), 'HH:mm')}
                                        </div>
                                        <div className="flex-1 relative flex items-center">
                                            <div className="w-3 h-3 rounded-full bg-orange-500 dark:bg-orange-400 animate-pulse shadow-[0_0_15px_rgba(251,146,60,0.8)] -ml-1.5 shrink-0" />
                                            <div className="flex-1 h-[2px] bg-gradient-to-r from-orange-600 dark:from-orange-500 via-[#d90479] to-purple-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </DndContext>
    );
}

function DroppableHour({ dayIndex, hour, onClick }: { dayIndex: number; hour: number; onClick?: () => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: `cell-${dayIndex}-${hour}` });
    return (
        <div
            ref={setNodeRef}
            onClick={onClick}
            className={cn(
                "border-b border-dashed border-[var(--glass-border)] dark:border-white/[0.03] transition-colors cursor-pointer group",
                isOver ? "bg-purple-500/20 border-l-2 border-purple-400/60 shadow-[inset_0_0_20px_rgba(168,85,247,0.15)]" : "hover:bg-[var(--glass-bg)]"
            )}
            style={{ height: CELL_HEIGHT }}
        >
            <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center justify-center h-full transition-opacity">
                <Plus className="w-3 h-3 text-[var(--text-tertiary)]" />
            </div>
        </div>
    );
}

function BlockCard({ block, layout, onClick, isDayView, index = 0 }: { block: any; layout: LayoutBlock; onClick: () => void; isDayView?: boolean; index?: number }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: block.id,
        disabled: block.is_locked || block.block_type === 'anchor' || block.block_type === 'meal' || block.block_type === 'sleep'
    });

    const colors = getBlockColors(block);
    const isDone = block.status === 'done';
    const isMissed = block.status === 'missed' || block.status === 'cancelled';

    const widthPercent = 100 / layout.totalCols;
    const leftPercent = widthPercent * layout.colIndex;
    const gap = isDayView ? 4 : 2;

    // dnd-kit's `transform` is a pointer *delta*, not an absolute position —
    // it must be layered on top of the block's resting top/left/width, never
    // replace them. Swapping the whole style object here used to make the
    // block jump to a hardcoded size/position the instant a drag started,
    // before jerking into following the cursor.
    const restingStyle: React.CSSProperties = {
        top: `${layout.top}px`,
        height: `${Math.max(layout.height, 28)}px`,
        left: `calc(${leftPercent}% + ${gap}px)`,
        width: `calc(${widthPercent}% - ${gap * 2}px)`
    };

    const style: React.CSSProperties = transform ? {
        ...restingStyle,
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
    } : restingStyle;

    const animatingBlocks = usePremiumCalendar(state => state.animatingBlocks);
    const animBlock = animatingBlocks.find(b => b.id === block.id);
    const [isHidden, setIsHidden] = useState(() => {
        return animBlock ? Date.now() < animBlock.showAfter : false;
    });

    useEffect(() => {
        if (animBlock && Date.now() < animBlock.showAfter) {
            setIsHidden(true);
            const delay = animBlock.showAfter - Date.now();
            const timer = setTimeout(() => setIsHidden(false), delay);
            return () => clearTimeout(timer);
        } else {
            setIsHidden(false);
        }
    }, [animBlock]);

    return (
        <motion.div
            ref={setNodeRef}
            initial={isHidden ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            animate={isHidden ? { opacity: 0 } : { opacity: 1, scale: 1 }}
            transition={transform ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30, delay: isHidden ? 0 : index * 0.05 }}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => { if (!isDragging) onClick(); }}
            className={cn(
                "absolute rounded-xl overflow-hidden cursor-pointer flex flex-col touch-manipulation",
                "transition-all duration-300 hover:scale-[1.03] hover:z-20 group backdrop-blur-xl shadow-lg",
                isDragging ? "opacity-60 z-50 shadow-[0_20px_40px_rgba(249,115,22,0.4)] ring-2 ring-orange-400/80 scale-[1.05]" : colors.edge,
                colors.bg, colors.border, colors.borderWidth, colors.glow,
                STATUS_STYLES[block.status] || ''
            )}
        >
            <div className="p-2.5 h-full flex flex-col relative z-10">
                <div className="flex items-start justify-between gap-1.5">
                    <span className={cn(
                        "text-[12px] font-bold leading-tight tracking-tight flex-1",
                        isDayView ? "text-[13px]" : "",
                        colors.text,
                        isMissed && "line-through opacity-70"
                    )}>
                        {block.title || block.context || 'Untitled'}
                    </span>
                    {isDone && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    {(block.block_type === 'anchor' || block.block_type === 'meal') && <Lock className={cn("w-3 h-3 shrink-0", colors.metaText)} />}
                </div>

                {/* Time display — always show in day view, or when block is tall enough */}
                {(isDayView || layout.height > 35) && (
                    <div className={cn("text-[10px] font-mono mt-0.5 opacity-60", colors.text)}>
                        {block.start_time?.slice(0, 5)} - {block.end_time?.slice(0, 5)}
                    </div>
                )}

                {layout.height > 60 && (
                    <div className="mt-auto pt-1 flex items-center justify-between border-t border-[var(--glass-border)]">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", colors.dot)} aria-hidden="true" />
                            <div className={cn("text-[9px] font-bold uppercase tracking-wider truncate", colors.metaText)}>
                                {block.goal?.category || block.goal?.pillar || block.pillar || block.block_type || 'general'}
                            </div>
                        </div>
                        {isDone && (
                            <div className="text-[9px] text-emerald-400/60 font-bold">DONE</div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
