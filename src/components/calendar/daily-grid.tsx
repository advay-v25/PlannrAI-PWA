'use client';

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, startOfDay, addMinutes, differenceInMinutes } from 'date-fns';
import { Clock, Anchor, Repeat, Brain, ListChecks, Check, X, Lock } from 'lucide-react';
import type { ScheduleBlock, Goal } from '@/types/database';

interface DailyGridProps {
    date: Date;
    blocks: (ScheduleBlock & { goal?: Goal })[];
    onBlockClick?: (block: ScheduleBlock & { goal?: Goal }) => void;
    onSlotClick?: (startTime: string, endTime: string) => void;
    onStatusChange?: (blockId: string, status: 'planned' | 'done' | 'partial' | 'missed') => void;
    onBlockMove?: (blockId: string, newStartTime: string, newEndTime: string) => void;
}

const HOUR_HEIGHT = 80; // pixels per hour
const MINUTE_HEIGHT = HOUR_HEIGHT / 60;
const START_HOUR = 5; // Start grid at 5 AM
const END_HOUR = 24; // End grid at midnight

export function DailyGrid({
    date,
    blocks,
    onBlockClick,
    onSlotClick,
    onStatusChange,
    onBlockMove
}: DailyGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

    // Calculate lanes for overlapping blocks
    const sortedBlocks = [...blocks].sort((a, b) => {
        const startDiff = a.start_time.localeCompare(b.start_time);
        if (startDiff !== 0) return startDiff;
        return b.end_time.localeCompare(a.end_time); // Longer blocks first if same start
    });

    const calculateLanes = () => {
        const lanes: (ScheduleBlock & { goal?: Goal })[][] = [];
        const blockLanes = new Map<string, number>();

        sortedBlocks.forEach(block => {
            let placed = false;
            for (let i = 0; i < lanes.length; i++) {
                const lastInLane = lanes[i][lanes[i].length - 1];
                if (block.start_time >= lastInLane.end_time) {
                    lanes[i].push(block);
                    blockLanes.set(block.id, i);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                lanes.push([block]);
                blockLanes.set(block.id, lanes.length - 1);
            }
        });

        return { blockLanes, totalLanes: lanes.length };
    };

    const { blockLanes, totalLanes } = calculateLanes();

    const getTop = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return (h - START_HOUR) * HOUR_HEIGHT + m * MINUTE_HEIGHT;
    };

    const getHeight = (start: string, end: string) => {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const duration = (eh * 60 + em) - (sh * 60 + sm);
        return Math.max(duration * MINUTE_HEIGHT, 40); // Min height for readability
    };

    const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onSlotClick || !containerRef.current) return;
        if ((e.target as HTMLElement).closest('.block-card')) return;

        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top + containerRef.current.scrollTop;

        const totalMinutes = Math.floor(y / MINUTE_HEIGHT);
        const hour = Math.floor(totalMinutes / 60) + START_HOUR;
        const minute = Math.floor((totalMinutes % 60) / 15) * 15;

        if (hour >= START_HOUR && hour < END_HOUR) {
            const startStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const endStr = `${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            onSlotClick(startStr, endStr);
        }
    };

    useEffect(() => {
        if (containerRef.current) {
            const wakeTimeTop = (7 - START_HOUR) * HOUR_HEIGHT;
            containerRef.current.scrollTop = wakeTimeTop;
        }
    }, [date]);

    return (
        <div
            ref={containerRef}
            className="relative h-[600px] bg-[var(--glass-bg)] backdrop-blur-xl rounded-[2.5rem] border border-white/5 overflow-y-auto no-scrollbar shadow-2xl"
            onClick={handleGridClick}
        >
            {/* Hour Lines */}
            <div className="absolute inset-0 pointer-events-none px-6">
                {hours.map(hour => (
                    <div
                        key={hour}
                        className="absolute w-full border-t border-white/[0.03] flex items-start gap-4"
                        style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                    >
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] -mt-2.5 opacity-50">
                            {format(new Date().setHours(hour, 0), 'HH:mm')}
                        </span>
                    </div>
                ))}
            </div>

            {/* Blocks Container */}
            <div className="relative ml-20 mr-6 min-h-full py-2">
                {sortedBlocks.map(block => {
                    const top = getTop(block.start_time);
                    const height = getHeight(block.start_time, block.end_time);
                    const lane = blockLanes.get(block.id) || 0;
                    const width = 100 / totalLanes;
                    const left = lane * width;

                    const isAnchor = block.block_type === 'anchor' || block.block_type === 'sleep';
                    const isRoutine = block.block_type === 'routine' || block.block_type === 'wind_down';

                    const colors: Record<string, string> = {
                        mind: 'from-[var(--color-mind)]/10 to-[var(--color-mind)]/5 border-[var(--color-mind)]/30 shadow-[0_0_20px_var(--color-mind-glow)]',
                        body: 'from-[var(--color-body)]/10 to-[var(--color-body)]/5 border-[var(--color-body)]/30 shadow-[0_0_20px_var(--color-body-glow)]',
                        craft: 'from-[var(--color-craft)]/10 to-[var(--color-craft)]/5 border-[var(--color-craft)]/30 shadow-[0_0_20px_var(--color-craft-glow)]',
                        anchor: 'from-[var(--color-anchor)]/10 to-[var(--color-anchor)]/5 border-[var(--color-anchor)]/30 shadow-[0_0_20px_var(--color-anchor-glow)]',
                        routine: 'from-[var(--color-routine)]/10 to-[var(--color-routine)]/5 border-[var(--color-routine)]/30 shadow-[0_0_20px_var(--color-routine-glow)]',
                        default: 'from-primary/10 to-primary/5 border-primary/20 shadow-[0_0_20px_var(--color-primary-glow)]'
                    };

                    const type = isAnchor ? 'anchor' : isRoutine ? 'routine' : block.goal?.category || 'default';
                    const colorClasses = colors[type] || colors.default;

                    return (
                        <motion.div
                            key={block.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            drag={isAnchor ? false : "y"}
                            dragMomentum={false}
                            dragElastic={0.1}
                            onDragEnd={(_, info) => {
                                const moveY = info.offset.y;
                                const slotsMoved = Math.round(moveY / MINUTE_HEIGHT / 15);
                                if (slotsMoved !== 0 && onBlockMove) {
                                    const minutesMoved = slotsMoved * 15;
                                    const [sh, sm] = block.start_time.split(':').map(Number);
                                    const [eh, em] = block.end_time.split(':').map(Number);

                                    const oldStartMin = sh * 60 + sm;
                                    const oldEndMin = eh * 60 + em;

                                    const newStartMin = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, oldStartMin + minutesMoved));
                                    const newEndMin = newStartMin + (oldEndMin - oldStartMin);

                                    if (newEndMin <= END_HOUR * 60) {
                                        const h1 = Math.floor(newStartMin / 60);
                                        const m1 = newStartMin % 60;
                                        const h2 = Math.floor(newEndMin / 60);
                                        const m2 = newEndMin % 60;

                                        const toTime = (h: number, m: number) =>
                                            `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

                                        onBlockMove(block.id, toTime(h1, m1), toTime(h2, m2));
                                    }
                                }
                            }}
                            whileDrag={{ scale: 1.05, zIndex: 50, cursor: 'grabbing', opacity: 0.8 }}
                            style={{ top: `${top}%`, height: `${height}%`, left: `${left}%`, width: `${width}%` }}
                            className={`absolute p-1 rounded-lg border backdrop-blur-md bg-gradient-to-br transition-all hover:z-20 group cursor-grab active:cursor-grabbing ${colorClasses}`}
                        >
                            <div className="flex flex-col h-full justify-between pointer-events-none">
                                <div className="text-[10px] font-bold truncate opacity-80 pl-1">{block.title}</div>
                                <div className="text-[9px] opacity-60 pl-1 pb-1 font-mono">{format(new Date(block.start_time), 'HH:mm')}</div>
                            </div>

                            {/* Status Indicator */}
                            <div className={`absolute top-0 right-0 w-1 h-full rounded-r-2xl ${block.status === 'done' ? 'bg-emerald-500' :
                                block.status === 'missed' ? 'bg-red-500' : 'bg-transparent'
                                }`} />
                        </motion.div>
                    );
                })}

            </div>

            {/* Current Time Indicator */}
            <CurrentTimeLine startHour={START_HOUR} />
        </div >
    );
}

function CurrentTimeLine({ startHour }: { startHour: number }) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const top = (now.getHours() - startHour) * HOUR_HEIGHT + now.getMinutes() * MINUTE_HEIGHT;

    if (now.getHours() < startHour || now.getHours() >= END_HOUR) return null;

    return (
        <div
            className="absolute left-0 right-0 z-20 pointer-events-none flex items-center px-4"
            style={{ top }}
        >
            <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] z-30" />
            <div className="flex-1 h-[2px] bg-gradient-to-r from-red-500 to-transparent opacity-60 ml-[-6px]" />
        </div>
    );
}
