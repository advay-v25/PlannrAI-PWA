'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes } from 'date-fns';
import { DndContext, useDraggable, useDroppable, DragEndEvent } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Lock, Check, X, Plus } from 'lucide-react';
import { calculateLayout, LayoutBlock } from '@/lib/calendar-layout';
import { motion } from 'framer-motion';

interface WeekGridProps {
    date: Date;
    blocks: any[];
    onBlockMove: (id: string, newDate: string, newStart: string, newEnd: string) => void;
    onBlockSelect: (block: any) => void;
    onCellClick?: (date: string, hour: number) => void;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 5am - 10pm
const CELL_HEIGHT = 64;

// Pillar color mapping
const PILLAR_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    mind: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/25', text: 'text-cyan-300', dot: 'bg-cyan-400' },
    body: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    craft: { bg: 'bg-violet-500/10', border: 'border-violet-500/25', text: 'text-violet-300', dot: 'bg-violet-400' },
    soul: { bg: 'bg-rose-500/10', border: 'border-rose-500/25', text: 'text-rose-300', dot: 'bg-rose-400' },
    anchor: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', text: 'text-amber-300', dot: 'bg-amber-400' },
    break: { bg: 'bg-gray-500/10', border: 'border-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-400' },
    default: { bg: 'bg-blue-500/10', border: 'border-blue-500/25', text: 'text-blue-300', dot: 'bg-blue-400' }
};

function getBlockColors(block: any) {
    if (block.block_type === 'anchor') return PILLAR_COLORS.anchor;
    if (block.block_type === 'break' || block.block_type === 'buffer') return PILLAR_COLORS.break;
    const pillar = (block.pillar || block.goal?.pillar || '').toLowerCase();
    return PILLAR_COLORS[pillar] || PILLAR_COLORS.default;
}

// Status overlay
const STATUS_STYLES: Record<string, string> = {
    done: 'opacity-60',
    missed: 'opacity-40',
    cancelled: 'opacity-30 line-through',
};

export function WeekGrid({ date, blocks, onBlockMove, onBlockSelect, onCellClick }: WeekGridProps) {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const gridRef = useRef<HTMLDivElement>(null);

    // Current time marker
    const [nowTop, setNowTop] = useState(0);
    const [nowDayIndex, setNowDayIndex] = useState(-1);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const minutes = now.getHours() * 60 + now.getMinutes();
            setNowTop(((minutes - 5 * 60) / 60) * CELL_HEIGHT); // offset by start hour (5am)
            const idx = days.findIndex(d => isSameDay(d, now));
            setNowDayIndex(idx);
        };
        updateTime();
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, [days]);

    // Auto-scroll to current time on mount
    useEffect(() => {
        if (gridRef.current && nowTop > 0) {
            gridRef.current.scrollTo({ top: Math.max(0, nowTop - 200), behavior: 'smooth' });
        }
    }, []);

    // Pre-compute layout per day (moved out of render loop to fix hooks violation)
    const dayLayouts = useMemo(() => {
        const layouts = new Map<number, Map<string, LayoutBlock>>();
        days.forEach((day, i) => {
            const dayBlocks = blocks.filter(b => isSameDay(new Date(b.date), day));
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

    return (
        <DndContext onDragEnd={handleDragEnd}>
            <div className="h-full overflow-y-auto relative no-scrollbar" ref={gridRef}>

                {/* Day Headers */}
                <div className="sticky top-0 z-20 flex border-b border-white/5 bg-black/90 backdrop-blur-xl">
                    <div className="w-14 shrink-0 border-r border-white/5" />
                    {days.map((day, i) => {
                        const isToday = isSameDay(day, new Date());
                        const dayBlocks = blocks.filter(b => isSameDay(new Date(b.date), day));
                        const done = dayBlocks.filter(b => b.status === 'done').length;
                        return (
                            <div key={i} className={cn(
                                "flex-1 min-w-[110px] text-center py-2.5 border-r border-white/5 last:border-r-0 transition-colors",
                                isToday && "bg-[var(--color-primary)]/5"
                            )}>
                                <div className={cn(
                                    "text-[10px] uppercase font-bold tracking-widest",
                                    isToday ? "text-[var(--color-primary)]" : "text-white/30"
                                )}>
                                    {format(day, 'EEE')}
                                </div>
                                <div className={cn(
                                    "text-lg font-bold",
                                    isToday ? "text-white" : "text-white/50"
                                )}>
                                    {format(day, 'd')}
                                </div>
                                {dayBlocks.length > 0 && (
                                    <div className="text-[9px] text-white/25 font-mono">
                                        {done}/{dayBlocks.length}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Grid Body */}
                <div className="flex relative" style={{ minHeight: HOURS.length * CELL_HEIGHT }}>

                    {/* Time Column */}
                    <div className="w-14 shrink-0 border-r border-white/5">
                        {HOURS.map(h => (
                            <div key={h} className="border-b border-white/5 text-[10px] text-white/20 text-right pr-2 pt-1 font-mono" style={{ height: CELL_HEIGHT }}>
                                {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    {days.map((day, dayIndex) => {
                        const dayBlocks = blocks.filter(b => isSameDay(new Date(b.date), day));
                        const layoutMap = dayLayouts.get(dayIndex) || new Map();
                        const isToday = isSameDay(day, new Date());

                        return (
                            <div key={dayIndex} className={cn(
                                "flex-1 min-w-[110px] border-r border-white/5 last:border-r-0 relative",
                                isToday && "bg-[var(--color-primary)]/[0.02]"
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
                                {dayBlocks.map(block => {
                                    const layout = layoutMap.get(block.id);
                                    if (!layout) return null;
                                    // Adjust layout top for the start-hour offset
                                    const adjustedLayout = {
                                        ...layout,
                                        top: layout.top - (5 * CELL_HEIGHT) // offset since we start at 5am
                                    };
                                    return (
                                        <BlockCard
                                            key={block.id}
                                            block={block}
                                            layout={adjustedLayout}
                                            onClick={() => onBlockSelect(block)}
                                        />
                                    );
                                })}

                                {/* Current Time Line */}
                                {dayIndex === nowDayIndex && nowTop > 0 && (
                                    <div
                                        className="absolute left-0 right-0 z-30 pointer-events-none"
                                        style={{ top: nowTop }}
                                    >
                                        <div className="relative">
                                            <div className="absolute -left-1 -top-[3px] w-[7px] h-[7px] rounded-full bg-red-500" />
                                            <div className="h-[1.5px] bg-red-500/70 w-full" />
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
    const { setNodeRef, isOver } = useDroppable({
        id: `cell-${dayIndex}-${hour}`,
    });

    return (
        <div
            ref={setNodeRef}
            onClick={onClick}
            className={cn(
                "border-b border-white/5 transition-colors cursor-pointer group",
                isOver ? "bg-[var(--color-primary)]/10" : "hover:bg-white/[0.02]"
            )}
            style={{ height: CELL_HEIGHT }}
        >
            {/* Plus icon on hover */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-full transition-opacity">
                <Plus className="w-3 h-3 text-white/15" />
            </div>
        </div>
    );
}

function BlockCard({ block, layout, onClick }: { block: any; layout: LayoutBlock; onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: block.id,
        disabled: block.block_type === 'anchor'
    });

    const colors = getBlockColors(block);
    const isDone = block.status === 'done';
    const isMissed = block.status === 'missed' || block.status === 'cancelled';

    const widthPercent = 100 / layout.totalCols;
    const leftPercent = widthPercent * layout.colIndex;
    const gap = 2;

    const style: React.CSSProperties = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        width: '180px',
        height: `${layout.height}px`
    } : {
        top: `${layout.top}px`,
        height: `${Math.max(layout.height, 20)}px`,
        left: `calc(${leftPercent}% + ${gap}px)`,
        width: `calc(${widthPercent}% - ${gap * 2}px)`
    };

    return (
        <motion.div
            ref={setNodeRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={style}
            {...listeners}
            {...attributes}
            onClick={(e) => { if (!isDragging) onClick(); }}
            className={cn(
                "absolute rounded-lg border overflow-hidden cursor-pointer transition-all",
                "hover:brightness-125 hover:shadow-lg hover:z-20",
                isDragging && "opacity-50 z-50 shadow-2xl ring-1 ring-white/30",
                colors.bg, colors.border,
                STATUS_STYLES[block.status] || '',
                "backdrop-blur-sm"
            )}
        >
            <div className="p-1.5 h-full flex flex-col">
                <div className="flex items-start gap-1">
                    {/* Status dot */}
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-1", colors.dot, isDone && "bg-emerald-400", isMissed && "bg-red-400")} />
                    <span className={cn(
                        "text-[11px] font-medium leading-tight truncate flex-1",
                        colors.text,
                        isMissed && "line-through"
                    )}>
                        {block.title || block.context || 'Untitled'}
                    </span>
                    {isDone && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                    {block.block_type === 'anchor' && <Lock className="w-2.5 h-2.5 text-amber-400/50 shrink-0" />}
                </div>
                {layout.height > 35 && (
                    <div className={cn("text-[9px] mt-0.5 font-mono", colors.text, "opacity-50")}>
                        {block.start_time?.slice(0, 5)} – {block.end_time?.slice(0, 5)}
                    </div>
                )}
                {layout.height > 55 && block.pillar && (
                    <div className="mt-auto">
                        <span className={cn("text-[8px] font-bold uppercase tracking-wider", colors.text, "opacity-40")}>
                            {block.pillar}
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
