'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes } from 'date-fns';
import { DndContext, useDraggable, useDroppable, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Lock, Check, Plus } from 'lucide-react';
import { calculateLayout, LayoutBlock } from '@/lib/calendar-layout';
import { motion } from 'framer-motion';

interface WeekGridProps {
    date: Date;
    blocks: any[];
    onBlockMove: (id: string, newDate: string, newStart: string, newEnd: string) => void;
    onBlockSelect: (block: any) => void;
    onCellClick?: (date: string, hour: number) => void;
    viewMode?: 'day' | 'week';
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am - 11pm
const CELL_HEIGHT = 72;

// Premium pastel colors matching reference images (black/orange theme)
const PILLAR_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    mind:    { bg: 'bg-sky-400/15',     border: 'border-sky-400/25',    text: 'text-sky-100',    dot: 'bg-sky-400' },
    body:    { bg: 'bg-emerald-400/15', border: 'border-emerald-400/25', text: 'text-emerald-100', dot: 'bg-emerald-400' },
    craft:   { bg: 'bg-amber-400/15',   border: 'border-amber-400/25',  text: 'text-amber-100',  dot: 'bg-amber-400' },
    anchor:  { bg: 'bg-zinc-700/40',    border: 'border-zinc-500/20',   text: 'text-zinc-300',   dot: 'bg-zinc-500' },
    meal:    { bg: 'bg-orange-400/10',   border: 'border-orange-400/20', text: 'text-orange-200', dot: 'bg-orange-400' },
    sleep:   { bg: 'bg-black/40',       border: 'border-white/[0.03]',  text: 'text-white/30',   dot: 'bg-white/10' },
    break:   { bg: 'bg-transparent',    border: 'border-white/[0.04]',  text: 'text-white/40',   dot: 'bg-white/20' },
    default: { bg: 'bg-violet-400/12',  border: 'border-violet-400/20', text: 'text-violet-200', dot: 'bg-violet-400' },
};

function getBlockColors(block: any) {
    if (block.is_locked || block.block_type === 'anchor') return PILLAR_COLORS.anchor;
    if (block.block_type === 'meal') return PILLAR_COLORS.meal;
    if (block.block_type === 'sleep') return PILLAR_COLORS.sleep;
    if (block.block_type === 'break' || block.block_type === 'buffer') return PILLAR_COLORS.break;
    const pillar = (block.pillar || block.goal?.pillar || '').toLowerCase();
    return PILLAR_COLORS[pillar] || PILLAR_COLORS.default;
}

const STATUS_STYLES: Record<string, string> = {
    done: 'opacity-60',
    missed: 'opacity-40',
    cancelled: 'opacity-30',
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

    // Auto-scroll to current time on mount
    useEffect(() => {
        if (gridRef.current && nowTop > 0) {
            gridRef.current.scrollTo({ top: Math.max(0, nowTop - 200), behavior: 'smooth' });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Pre-compute layout per day
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

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    return (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
            <div className="h-full overflow-y-auto relative no-scrollbar" ref={gridRef}>

                {/* Day Headers */}
                <div className="sticky top-0 z-20 flex border-b border-white/[0.06] bg-black/95 backdrop-blur-xl">
                    <div className="w-14 shrink-0 border-r border-white/[0.04]" />
                    {days.map((day, i) => {
                        const isToday = isSameDay(day, new Date());
                        const dayBlocks = blocks.filter(b => isSameDay(new Date(b.date), day));
                        const done = dayBlocks.filter(b => b.status === 'done').length;
                        return (
                            <div key={i} className={cn(
                                "flex-1 text-center py-3 border-r border-white/[0.04] last:border-r-0 transition-colors relative",
                                viewMode === 'day' ? 'min-w-0' : 'min-w-[110px]'
                            )}>
                                <div className="flex flex-col items-center gap-1">
                                    <div className={cn(
                                        "text-[10px] uppercase font-bold tracking-widest",
                                        isToday ? "text-orange-400" : "text-white/30"
                                    )}>
                                        {format(day, 'EEE')}
                                    </div>
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                                        isToday ? "bg-orange-500 text-black" : "text-white/70"
                                    )}>
                                        {format(day, 'd')}
                                    </div>
                                    {dayBlocks.length > 0 && (
                                        <div className="text-[9px] text-white/30 font-mono">
                                            <span className={done === dayBlocks.length ? "text-emerald-400/70" : ""}>
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
                    <div className="w-14 shrink-0 border-r border-white/[0.04]">
                        {HOURS.map(h => (
                            <div key={h} className="border-b border-white/[0.03] text-[10px] text-white/20 text-right pr-2 pt-1 font-mono"
                                style={{ height: CELL_HEIGHT }}>
                                {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
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
                                "flex-1 border-r border-white/[0.04] last:border-r-0 relative",
                                viewMode === 'day' ? 'min-w-0' : 'min-w-[110px]',
                                isToday && "bg-orange-500/[0.02]"
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
                                        />
                                    );
                                })}

                                {/* Current Time Line — orange */}
                                {dayIndex === nowDayIndex && nowTop > 0 && (
                                    <div
                                        className="absolute left-[-56px] right-0 z-30 pointer-events-none flex items-center"
                                        style={{ top: nowTop - 6 }}
                                    >
                                        <div className="w-14 text-[10px] text-orange-500 font-bold text-right pr-2 shrink-0">
                                            {format(new Date(), 'HH:mm')}
                                        </div>
                                        <div className="flex-1 relative flex items-center">
                                            <div className="w-2 h-2 rounded-full bg-orange-500 -ml-1 shrink-0" />
                                            <div className="flex-1 h-[2px] bg-orange-500/80 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
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
                "border-b border-white/[0.03] transition-colors cursor-pointer group",
                isOver ? "bg-orange-500/10" : "hover:bg-white/[0.02]"
            )}
            style={{ height: CELL_HEIGHT }}
        >
            <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-full transition-opacity">
                <Plus className="w-3 h-3 text-white/15" />
            </div>
        </div>
    );
}

function BlockCard({ block, layout, onClick, isDayView }: { block: any; layout: LayoutBlock; onClick: () => void; isDayView?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: block.id,
        disabled: block.is_locked || block.block_type === 'anchor' || block.block_type === 'sleep'
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

    return (
        <motion.div
            ref={setNodeRef}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={transform ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => { if (!isDragging) onClick(); }}
            className={cn(
                "absolute rounded-lg overflow-hidden cursor-pointer flex flex-col",
                "hover:brightness-110 hover:shadow-xl hover:z-20 group border",
                isDragging ? "opacity-60 z-50 shadow-2xl ring-2 ring-orange-400/50" : "",
                colors.bg, colors.border,
                STATUS_STYLES[block.status] || '',
                "backdrop-blur-sm transition-shadow duration-300"
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
                    {block.block_type === 'anchor' && <Lock className="w-3 h-3 text-white/30 shrink-0" />}
                </div>

                {/* Time display — always show in day view, or when block is tall enough */}
                {(isDayView || layout.height > 35) && (
                    <div className={cn("text-[10px] font-mono mt-0.5 opacity-60", colors.text)}>
                        {block.start_time?.slice(0, 5)} - {block.end_time?.slice(0, 5)}
                    </div>
                )}

                {layout.height > 60 && (
                    <div className="mt-auto pt-1 flex items-center justify-between border-t border-white/[0.04]">
                        <div className={cn("text-[9px] font-bold uppercase tracking-wider truncate", colors.text, "opacity-50")}>
                            {block.pillar || block.block_type || 'general'}
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
