'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes } from 'date-fns';
import { DndContext, useDraggable, useDroppable, DragEndEvent, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
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
// Each colored block gets a layered "satin" treatment instead of a flat
// tint: a diagonal glass-sheen streak (rgba white, fades in/out) stacked
// over a richer color wash, plus a solid 3px accent stripe on the leading
// edge (`edge`) so the pillar is unambiguous even before reading the tint —
// this is what keeps visually-close hues (e.g. meal vs. craft) from being
// confused with each other, on top of the hue separation in globals.css.
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
const PILLAR_COLORS: Record<string, { bg: string; border: string; text: string; metaText: string; dot: string; glow: string; edge: string }> = {
    mind: {
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.55)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-mind)_38%,_transparent)_0%,_color-mix(in_oklab,_var(--color-mind)_18%,_transparent)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.10)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-mind)_16%,_transparent)_0%,_color-mix(in_oklab,_var(--color-mind)_7%,_transparent)_100%)]',
        border: 'border-[var(--color-mind)]/55 dark:border-[var(--color-mind)]/32',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-mind)] dark:bg-[var(--color-mind)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_1px_rgba(255,255,255,0.28)] dark:shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_1px_rgba(255,255,255,0.08)]',
        glow: 'block-glow-mind dark:block-glow-mind',
    },
    body: {
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.55)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-body)_38%,_transparent)_0%,_color-mix(in_oklab,_var(--color-body)_18%,_transparent)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.10)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-body)_16%,_transparent)_0%,_color-mix(in_oklab,_var(--color-body)_7%,_transparent)_100%)]',
        border: 'border-[var(--color-body)]/55 dark:border-[var(--color-body)]/32',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-body)] dark:bg-[var(--color-body)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-body),inset_0_1px_1px_rgba(255,255,255,0.28)] dark:shadow-[inset_3px_0_0_0_var(--color-body),inset_0_1px_1px_rgba(255,255,255,0.08)]',
        glow: 'block-glow-body dark:block-glow-body',
    },
    craft: {
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.55)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-craft)_38%,_transparent)_0%,_color-mix(in_oklab,_var(--color-craft)_18%,_transparent)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.10)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-craft)_16%,_transparent)_0%,_color-mix(in_oklab,_var(--color-craft)_7%,_transparent)_100%)]',
        border: 'border-[var(--color-craft)]/55 dark:border-[var(--color-craft)]/32',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-craft)] dark:bg-[var(--color-craft)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-craft),inset_0_1px_1px_rgba(255,255,255,0.28)] dark:shadow-[inset_3px_0_0_0_var(--color-craft),inset_0_1px_1px_rgba(255,255,255,0.08)]',
        glow: 'block-glow-craft dark:block-glow-craft',
    },
    anchor: {
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.4)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_rgba(113,113,122,0.30)_0%,_rgba(113,113,122,0.14)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.08)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_rgba(113,113,122,0.24)_0%,_rgba(113,113,122,0.10)_100%)]',
        border: 'border-[rgba(113,113,122,0.5)] dark:border-[rgba(113,113,122,0.28)]',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-zinc-500 dark:bg-zinc-500',
        edge: 'shadow-[inset_3px_0_0_0_rgba(113,113,122,0.9),inset_0_1px_1px_rgba(255,255,255,0.28)] dark:shadow-[inset_3px_0_0_0_rgba(113,113,122,0.7),inset_0_1px_1px_rgba(255,255,255,0.08)]',
        glow: 'block-glow-anchor dark:block-glow-anchor',
    },
    meal: {
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.55)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-meal)_38%,_transparent)_0%,_color-mix(in_oklab,_var(--color-meal)_18%,_transparent)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.10)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-meal)_16%,_transparent)_0%,_color-mix(in_oklab,_var(--color-meal)_7%,_transparent)_100%)]',
        border: 'border-[var(--color-meal)]/55 dark:border-[var(--color-meal)]/32',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-meal)] dark:bg-[var(--color-meal)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-meal),inset_0_1px_1px_rgba(255,255,255,0.28)] dark:shadow-[inset_3px_0_0_0_var(--color-meal),inset_0_1px_1px_rgba(255,255,255,0.08)]',
        glow: 'block-glow-meal dark:block-glow-meal',
    },
    sleep: {
        bg: 'bg-slate-400/35 dark:bg-[var(--glass-bg)]',
        border: 'border-slate-400/40 dark:border-[var(--glass-border)]',
        text: 'text-[var(--text-primary)] dark:text-[var(--text-tertiary)]',
        metaText: 'text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]',
        dot: 'bg-slate-500 dark:bg-[var(--glass-bg)]',
        glow: '',
        edge: 'shadow-[inset_3px_0_0_0_rgba(100,116,139,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] dark:shadow-[inset_3px_0_0_0_rgba(100,116,139,0.35),inset_0_1px_1px_rgba(255,255,255,0.06)]',
    },
    break: {
        bg: 'bg-transparent dark:bg-transparent',
        border: 'border-[var(--glass-border)]',
        text: 'text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]',
        metaText: 'text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]',
        dot: 'bg-zinc-400 dark:bg-white/20',
        glow: '',
        edge: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]',
    },
    default: {
        bg: '[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.55)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-mind)_38%,_transparent)_0%,_color-mix(in_oklab,_var(--color-mind)_18%,_transparent)_100%)] dark:[background:linear-gradient(125deg,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.10)_16%,_rgba(255,255,255,0)_38%),_linear-gradient(135deg,_color-mix(in_oklab,_var(--color-mind)_16%,_transparent)_0%,_color-mix(in_oklab,_var(--color-mind)_7%,_transparent)_100%)]',
        border: 'border-[var(--color-mind)]/55 dark:border-[var(--color-mind)]/32',
        text: 'text-[var(--text-primary)] dark:text-white',
        metaText: 'text-[var(--text-secondary)] dark:text-white/70',
        dot: 'bg-[var(--color-mind)] dark:bg-[var(--color-mind)]',
        edge: 'shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_1px_rgba(255,255,255,0.28)] dark:shadow-[inset_3px_0_0_0_var(--color-mind),inset_0_1px_1px_rgba(255,255,255,0.08)]',
        glow: 'block-glow-mind dark:block-glow-mind',
    },
};

function getBlockColors(block: any) {
    if (block.is_locked || block.block_type === 'anchor') return PILLAR_COLORS.anchor;
    if (block.block_type === 'meal') return PILLAR_COLORS.meal;
    if (block.block_type === 'sleep') return PILLAR_COLORS.sleep;
    if (block.block_type === 'break' || block.block_type === 'buffer') return PILLAR_COLORS.break;
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
        if (over && active.id !== over.id) {
            const parts = (over.id as string).split('-');
            const dayIndex = parseInt(parts[1]);
            const hour = parseInt(parts[2]);
            const targetDate = format(days[dayIndex], 'yyyy-MM-dd');
            const targetStart = `${hour.toString().padStart(2, '0')}:00`;
            const block = blocks.find(b => b.id === active.id);
            if (block) {
                const duration = differenceInMinutes(
                    new Date(`2000-01-01T${block.end_time}`),
                    new Date(`2000-01-01T${block.start_time}`)
                );
                const endDateObj = new Date(`2000-01-01T${targetStart}`);
                endDateObj.setMinutes(endDateObj.getMinutes() + duration);
                const targetEnd = format(endDateObj, 'HH:mm');
                onBlockMove(active.id as string, targetDate, targetStart, targetEnd);
            }
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

    const style: React.CSSProperties = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        width: isDayView ? '300px' : '180px',
        height: `${layout.height}px`
    } : {
        top: `${layout.top}px`,
        height: `${Math.max(layout.height, 28)}px`,
        left: `calc(${leftPercent}% + ${gap}px)`,
        width: `calc(${widthPercent}% - ${gap * 2}px)`
    };

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
                "transition-all duration-300 hover:scale-[1.03] hover:z-20 group border-[1.5px] backdrop-blur-xl shadow-lg",
                isDragging ? "opacity-60 z-50 shadow-[0_20px_40px_rgba(249,115,22,0.4)] ring-2 ring-orange-400/80 scale-[1.05]" : colors.edge,
                colors.bg, colors.border, colors.glow,
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
                        <div className={cn("text-[9px] font-bold uppercase tracking-wider truncate", colors.metaText)}>
                            {block.goal?.category || block.goal?.pillar || block.pillar || block.block_type || 'general'}
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
