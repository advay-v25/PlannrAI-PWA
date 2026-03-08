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

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am - 11pm
const CELL_HEIGHT = 72;

// Premium color mapping with glassmorphism effects
const PILLAR_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; styleClasses?: string }> = {
    mind: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-100', dot: 'bg-indigo-400', styleClasses: '' },
    body: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-100', dot: 'bg-emerald-400', styleClasses: '' },
    craft: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-100', dot: 'bg-amber-400', styleClasses: '' },
    anchor: { bg: 'bg-zinc-800/40', border: 'border-white/[0.05]', text: 'text-zinc-300', dot: 'bg-zinc-500', styleClasses: 'bg-[url("/patterns/hatch.svg")] bg-repeat bg-black/20' },
    meal: { bg: 'bg-slate-500/5', border: 'border-slate-500/20 border-dashed border', text: 'text-slate-400', dot: 'bg-slate-500' },
    sleep: { bg: 'bg-black/40', border: 'border-white/[0.03]', text: 'text-white/30', dot: 'bg-white/10' },
    break: { bg: 'bg-transparent', border: 'border-white/[0.03]', text: 'text-white/40', dot: 'bg-white/20' },
    default: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-200', dot: 'bg-blue-400' }
};

function getBlockColors(block: any) {
    if (block.is_locked || block.block_type === 'anchor') return PILLAR_COLORS.anchor;
    if (block.block_type === 'meal') return PILLAR_COLORS.meal;
    if (block.block_type === 'sleep') return PILLAR_COLORS.sleep;
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
            setNowTop(((minutes - 6 * 60) / 60) * CELL_HEIGHT); // offset by start hour (6am)
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
                <div className="sticky top-0 z-20 flex border-b border-white/[0.05] bg-black/99 backdrop-blur-2xl pt-2 pb-2">
                    <div className="w-14 shrink-0 border-r border-white/[0.03]" />
                    {days.map((day, i) => {
                        const isToday = isSameDay(day, new Date());
                        const dayBlocks = blocks.filter(b => isSameDay(new Date(b.date), day));
                        const done = dayBlocks.filter(b => b.status === 'done').length;
                        return (
                            <div key={i} className={cn(
                                "flex-1 min-w-[110px] text-center border-r border-white/[0.03] last:border-r-0 transition-colors flex flex-col items-center justify-center gap-1.5 relative",
                            )}>
                                {/* Active Day Indicator background gradient */}
                                {isToday && (
                                    <div className="absolute inset-x-0 bottom-[-8px] top-full h-screen bg-white/[0.02] pointer-events-none -z-10" />
                                )}

                                <div className={cn("px-4 py-1.5 rounded-xl border flex flex-col items-center w-[72px]",
                                    isToday ? "bg-white/10 border-white/20 shadow-md" : "border-transparent text-white/50"
                                )}>
                                    <div className={cn("text-[22px] font-bold leading-none tracking-tight", isToday ? "text-white" : "")}>
                                        {format(day, 'd')}
                                    </div>
                                    <div className={cn("text-[9px] uppercase font-bold tracking-widest mt-1", isToday ? "text-white/80" : "text-white/30")}>
                                        {format(day, 'EEE')}
                                    </div>
                                </div>

                                {/* Teacher/Stats Row Replacement */}
                                {dayBlocks.length > 0 ? (
                                    <div className="text-[9px] text-white/40 font-mono flex items-center gap-1">
                                        <div className={cn("w-1.5 h-1.5 rounded-full", done === dayBlocks.length ? "bg-emerald-500" : "bg-emerald-500/50")} />
                                        <span className={done === dayBlocks.length ? "text-emerald-400/80" : ""}>{done}/{dayBlocks.length} DONE</span>
                                    </div>
                                ) : (
                                    <div className="text-[9px] text-white/20 font-mono">
                                        Open Day
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Grid Body */}
                <div className="flex relative" style={{ minHeight: HOURS.length * CELL_HEIGHT }}>

                    {/* Time Column */}
                    <div className="w-14 shrink-0 border-r border-white/[0.03]">
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
                                "flex-1 min-w-[110px] border-r border-white/[0.03] last:border-r-0 relative",
                                isToday && "bg-[var(--color-primary)]/[0.015]"
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
                                        top: layout.top - (6 * CELL_HEIGHT) // offset since we start at 6am
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
                                        className="absolute left-[-56px] right-0 z-30 pointer-events-none flex items-center pr-2"
                                        style={{ top: nowTop - 6 }}
                                    >
                                        <div className="w-14 text-[10px] text-red-500 font-bold text-right pr-2 shrink-0">
                                            {format(new Date(), 'HH:mm')} ►
                                        </div>
                                        <div className="flex-1 relative">
                                            <div className="h-[2px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.5)] w-full" />
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
                "border-b border-white/[0.03] transition-colors cursor-pointer group",
                isOver ? "bg-[var(--color-primary)]/10" : "hover:bg-white/[0.01]"
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
        disabled: block.is_locked || block.block_type === 'anchor' || block.block_type === 'sleep'
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
        height: `${Math.max(layout.height, 24)}px`, // slightly larger min-height for text
        left: `calc(${leftPercent}% + ${gap}px)`,
        width: `calc(${widthPercent}% - ${gap * 2}px)`
    };

    return (
        <motion.div
            ref={setNodeRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={transform ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
            style={style}
            {...listeners}
            {...attributes}
            onClick={(e) => { if (!isDragging) onClick(); }}
            className={cn(
                "absolute rounded-[6px] overflow-hidden cursor-pointer flex flex-col",
                "hover:brightness-110 hover:shadow-xl hover:z-20 group ring-1",
                isDragging ? "opacity-60 z-50 shadow-2xl ring-2 ring-white/30" : "ring-white/[0.05]",
                colors.bg, colors.border, colors.styleClasses,
                STATUS_STYLES[block.status] || '',
                "backdrop-blur-sm transition-shadow duration-300"
            )}
        >
            <div className="p-2 h-full flex flex-col relative z-10">
                <div className="flex items-start justify-between gap-1.5">
                    <span className={cn(
                        "text-[12px] font-bold leading-tight tracking-tight truncate flex-1",
                        colors.text,
                        isMissed && "line-through opacity-70"
                    )}>
                        {block.title || block.context || 'Untitled'}
                    </span>
                    {isDone && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    {block.block_type === 'anchor' && <Lock className="w-3 h-3 text-white/30 shrink-0" />}
                </div>

                {layout.height > 40 && (
                    <div className={cn("text-[10px] leading-tight mt-1 opacity-80 line-clamp-2", colors.text)}>
                        {block.meta?.description || "Planned block for today."}
                    </div>
                )}

                {layout.height > 60 && (
                    <div className="mt-auto pt-1 flex items-center justify-between border-t border-white/5">
                        <div className={cn("text-[9px] font-mono tracking-widest uppercase truncate max-w-[70%]", colors.text, "opacity-60")}>
                            {block.pillar ? block.pillar : 'GENERAL'}
                        </div>
                        <div className={cn("text-[9px] font-mono", colors.text, "opacity-50")}>
                            {layout.height > 80 ? `${block.start_time?.slice(0, 5)} - ${block.end_time?.slice(0, 5)}` : ''}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
