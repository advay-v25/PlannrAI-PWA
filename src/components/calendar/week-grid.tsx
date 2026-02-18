
import { useState, useRef, useEffect, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes, startOfDay } from 'date-fns';
import { DndContext, useDraggable, useDroppable, DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { cn } from '@/lib/utils';
import { Lock, AlignJustify } from 'lucide-react';
import { calculateLayout, LayoutBlock } from '@/lib/calendar-layout';
import { motion } from 'framer-motion';

interface WeekGridProps {
    date: Date;
    blocks: any[]; // ScheduleBlock
    onBlockMove: (id: string, newDate: string, newStart: string, newEnd: string) => void;
    onBlockSelect: (block: any) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELL_HEIGHT = 60; // 1 hour = 60px height

export function WeekGrid({ date, blocks, onBlockMove, onBlockSelect }: WeekGridProps) {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const gridRef = useRef<HTMLDivElement>(null);

    // Time Indicator
    const [nowTop, setNowTop] = useState(0);
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const minutes = now.getHours() * 60 + now.getMinutes();
            setNowTop((minutes / 60) * CELL_HEIGHT);
        };
        updateTime();
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const [_, dayIndexStr, hourStr] = (over.id as string).split('-');
            const dayIndex = parseInt(dayIndexStr);
            const hour = parseInt(hourStr);

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
            <div className="h-full overflow-y-auto relative no-scrollbar bg-black/20" ref={gridRef}>

                {/* Header / Days */}
                <div className="sticky top-0 z-20 flex border-b border-white/5 bg-black/80 backdrop-blur-md">
                    <div className="w-16 shrink-0 border-r border-white/5 bg-black/40" /> {/* Time Col */}
                    {days.map((day, i) => {
                        const isToday = isSameDay(day, new Date());
                        return (
                            <div key={i} className="flex-1 min-w-[120px] text-center py-2 border-r border-white/5 last:border-r-0">
                                <div className={cn("text-[10px] uppercase font-bold tracking-widest", isToday ? "text-[var(--color-primary)]" : "text-white/40")}>
                                    {format(day, 'EEE')}
                                </div>
                                <div className={cn("text-lg font-bold", isToday ? "text-white" : "text-white/60")}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Grid Body */}
                <div className="flex relative min-h-[1440px]"> {/* 24 * 60 */}

                    {/* Time Column */}
                    <div className="w-16 shrink-0 border-r border-white/5 bg-black/20">
                        {HOURS.map(h => (
                            <div key={h} className="h-[60px] border-b border-white/5 text-[10px] text-white/30 text-right pr-2 pt-1 font-mono">
                                {h}:00
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    {days.map((day, dayIndex) => {
                        const dayBlocks = blocks.filter(b => isSameDay(new Date(b.date), day));

                        // Calculate Smart Layout for this day
                        const layoutMap = useMemo(() => calculateLayout(dayBlocks, CELL_HEIGHT), [dayBlocks]);

                        return (
                            <div key={dayIndex} className="flex-1 min-w-[120px] border-r border-white/5 last:border-r-0 relative group">
                                {/* Hour Droppables */}
                                {HOURS.map(h => (
                                    <DroppableHour key={h} dayIndex={dayIndex} hour={h} />
                                ))}

                                {/* Blocks Overlay */}
                                {dayBlocks.map(block => {
                                    const layout = layoutMap.get(block.id);
                                    if (!layout) return null;
                                    return (
                                        <BlockCard
                                            key={block.id}
                                            block={block}
                                            layout={layout}
                                            onClick={() => onBlockSelect(block)}
                                        />
                                    );
                                })}

                                {/* Current Time Line (Today Only) */}
                                {isSameDay(day, new Date()) && (
                                    <div
                                        className="absolute left-0 right-0 h-0.5 bg-red-500 z-30 pointer-events-none opacity-60"
                                        style={{ top: nowTop }}
                                    >
                                        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
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

function DroppableHour({ dayIndex, hour }: { dayIndex: number, hour: number }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `cell-${dayIndex}-${hour}`,
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "h-[60px] border-b border-white/5 transition-colors",
                isOver ? "bg-white/5" : "hover:bg-white/[0.01]"
            )}
        />
    );
}

function BlockCard({ block, layout, onClick }: { block: any, layout: LayoutBlock, onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: block.id,
        disabled: block.block_type === 'anchor'
    });

    // Calculate layout styles based on Smart Packing
    const widthPercent = 100 / layout.totalCols;
    const leftPercent = widthPercent * layout.colIndex;

    // Slight gap between columns
    const gap = 2;

    const style: React.CSSProperties = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        width: '200px', // Fixed width while dragging for visibility
        height: `${layout.height}px`
    } : {
        top: `${layout.top}px`,
        height: `${layout.height}px`,
        left: `calc(${leftPercent}% + ${gap}px)`,
        width: `calc(${widthPercent}% - ${gap * 2}px)`
    };

    const isAnchor = block.block_type === 'anchor';

    return (
        <motion.div
            ref={setNodeRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            layout // Framer Motion magic for "Liquid" transitions
            style={style}
            {...listeners}
            {...attributes}
            onClick={(e) => {
                if (!isDragging) onClick();
            }}
            className={cn(
                "absolute rounded-lg border p-2 text-xs overflow-hidden cursor-pointer transition-colors shadow-sm hover:shadow-lg backdrop-blur-sm",
                isDragging ? "opacity-50 z-50 shadow-2xl ring-2 ring-white" : "z-10",
                isAnchor
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-200 hover:bg-blue-500/20 hover:border-blue-500/40",
                block.status === 'done' && "opacity-50 grayscale"
            )}
        >
            <div className="flex items-start justify-between gap-1">
                <span className="font-medium truncate leading-tight">
                    {block.context || block.title}
                </span>
                {isAnchor && <Lock className="w-3 h-3 shrink-0 opacity-50" />}
            </div>
            {layout.height > 40 && (
                <div className="text-[10px] opacity-60 mt-1 font-mono">
                    {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                </div>
            )}
        </motion.div>
    );
}
