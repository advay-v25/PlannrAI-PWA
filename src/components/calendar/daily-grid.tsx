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
    onStatusChange
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
                        mind: 'from-blue-500/20 to-indigo-500/20 shadow-blue-500/10 border-blue-500/30',
                        body: 'from-orange-500/20 to-red-500/20 shadow-orange-500/10 border-orange-500/30',
                        craft: 'from-emerald-500/20 to-teal-500/20 shadow-emerald-500/10 border-emerald-500/30',
                        anchor: 'from-amber-500/20 to-yellow-500/20 shadow-amber-500/10 border-amber-500/30',
                        routine: 'from-purple-500/20 to-fuchsia-500/20 shadow-purple-500/10 border-purple-500/30',
                        default: 'from-primary/20 to-primary/10 shadow-primary/5 border-primary/20'
                    };

                    const type = isAnchor ? 'anchor' : isRoutine ? 'routine' : block.goal?.category || 'default';
                    const colorClasses = colors[type] || colors.default;

                    return (
                        <motion.div
                            key={block.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            whileHover={{ scale: 0.99, x: -2 }}
                            className={`block-card absolute rounded-2xl border bg-gradient-to-br backdrop-blur-md p-3 flex flex-col gap-1.5 cursor-pointer transition-all hover:shadow-lg hover:shadow-black/20 ${colorClasses}`}
                            style={{
                                top: top + 4,
                                height: height - 8,
                                left: `${left}%`,
                                width: `${width - 1}%`, // Small gap between lanes
                                zIndex: 10 + lane,
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onBlockClick?.(block);
                            }}
                        >
                            <div className="flex items-start justify-between gap-2 overflow-hidden">
                                <span className="text-sm font-bold truncate tracking-tight">
                                    {block.goal?.title || block.context || 'Untitled'}
                                </span>
                                {block.status === 'done' && (
                                    <div className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                                        <Check className="w-2.5 h-2.5 text-emerald-500" />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)] font-medium opacity-80 mt-auto">
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 opacity-50" />
                                    <span>{block.start_time.slice(0, 5)}</span>
                                </div>
                                <div className="w-1 h-1 rounded-full bg-white/10" />
                                <span>{differenceInMinutes(parseISO(`1970-01-01T${block.end_time}`), parseISO(`1970-01-01T${block.start_time}`))}m</span>
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
        </div>
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
