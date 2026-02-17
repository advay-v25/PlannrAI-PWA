'use client';

import { useState, useRef, useEffect } from 'react';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes, startOfDay } from 'date-fns';
import { DndContext, useDraggable, useDroppable, DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { cn } from '@/lib/utils';
import { Lock, AlignJustify } from 'lucide-react';

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
            // active.id = blockId
            // over.id = `cell-${dayIndex}-${hour}`
            const [_, dayIndexStr, hourStr] = (over.id as string).split('-');
            const dayIndex = parseInt(dayIndexStr);
            const hour = parseInt(hourStr);

            const targetDate = format(days[dayIndex], 'yyyy-MM-dd');
            const targetStart = `${hour.toString().padStart(2, '0')}:00`;

            // Calculate duration to determine end time
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
                        return (
                            <div key={dayIndex} className="flex-1 min-w-[120px] border-r border-white/5 last:border-r-0 relative group">
                                {/* Hour Droppables */}
                                {HOURS.map(h => (
                                    <DroppableHour key={h} dayIndex={dayIndex} hour={h} />
                                ))}

                                {/* Blocks Overlay */}
                                {dayBlocks.map(block => (
                                    <BlockCard
                                        key={block.id}
                                        block={block}
                                        onClick={() => onBlockSelect(block)}
                                    />
                                ))}

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

function BlockCard({ block, onClick }: { block: any, onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: block.id,
        disabled: block.block_type === 'anchor' // Anchors are not draggable
    });

    // Calculate position and height
    const start = new Date(`2000-01-01T${block.start_time}`);
    const end = new Date(`2000-01-01T${block.end_time}`);
    let startMinutes = start.getHours() * 60 + start.getMinutes();
    let duration = differenceInMinutes(end, start);

    // Safety check for layout
    if (duration < 15) duration = 15;

    const top = (startMinutes / 60) * CELL_HEIGHT;
    const height = (duration / 60) * CELL_HEIGHT;

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50
    } : {
        top: `${top}px`,
        height: `${height}px`,
    };

    const isAnchor = block.block_type === 'anchor';

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={(e) => {
                // Prevent click if dragging logic triggers? 
                // dnd-kit usually handles this, simpler to pass onclick
                if (!isDragging) onClick();
            }}
            className={cn(
                "absolute inset-x-1 rounded-lg border p-2 text-xs overflow-hidden cursor-pointer transition-all hover:brightness-110",
                isDragging ? "opacity-50 z-50 shadow-xl" : "z-10",
                isAnchor
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-500 cursor-not-allowed"
                    : "bg-blue-500/20 border-blue-500/30 text-blue-200 cursor-grab active:cursor-grabbing",
                block.status === 'done' && "opacity-50 grayscale"
            )}
        >
            <div className="flex items-start justify-between gap-1">
                <span className="font-bold truncate leading-tight">
                    {block.context || block.title}
                </span>
                {isAnchor && <Lock className="w-3 h-3 shrink-0 opacity-50" />}
            </div>
            {height > 40 && (
                <div className="text-[10px] opacity-60 mt-1">
                    {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                </div>
            )}
        </div>
    );
}
