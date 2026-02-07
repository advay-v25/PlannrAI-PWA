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

    // Sort blocks by start time
    const sortedBlocks = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time));

    const getTop = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return (h - START_HOUR) * HOUR_HEIGHT + m * MINUTE_HEIGHT;
    };

    const getHeight = (start: string, end: string) => {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const duration = (eh * 60 + em) - (sh * 60 + sm);
        return Math.max(duration * MINUTE_HEIGHT, 30); // Min height for visibility
    };

    const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onSlotClick || !containerRef.current) return;

        // Prevent click if clicking a block
        if ((e.target as HTMLElement).closest('.block-card')) return;

        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top + containerRef.current.scrollTop;

        const totalMinutes = Math.floor(y / MINUTE_HEIGHT);
        const hour = Math.floor(totalMinutes / 60) + START_HOUR;
        const minute = Math.floor((totalMinutes % 60) / 15) * 15; // Round to nearest 15m

        if (hour >= START_HOUR && hour < END_HOUR) {
            const startStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const endStr = `${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            onSlotClick(startStr, endStr);
        }
    };

    // Scroll to safe wake time or first block on mount
    useEffect(() => {
        if (containerRef.current) {
            const wakeTimeTop = (7 - START_HOUR) * HOUR_HEIGHT; // Scroll to 7 AM
            containerRef.current.scrollTop = wakeTimeTop;
        }
    }, []);

    return (
        <div
            ref={containerRef}
            className="relative h-[600px] bg-white/5 rounded-3xl border border-white/5 overflow-y-auto no-scrollbar"
            onClick={handleGridClick}
        >
            {/* Hour Lines */}
            <div className="absolute inset-0 pointer-events-none">
                {hours.map(hour => (
                    <div
                        key={hour}
                        className="absolute w-full border-t border-white/5 flex items-start gap-3"
                        style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                    >
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] -mt-2 ml-2">
                            {format(new Date().setHours(hour, 0), 'HH:mm')}
                        </span>
                        <div className="flex-1 border-t border-white/[0.02]" />
                    </div>
                ))}
            </div>

            {/* Blocks */}
            <div className="relative ml-16 mr-4 min-h-full">
                {sortedBlocks.map(block => {
                    const top = getTop(block.start_time);
                    const height = getHeight(block.start_time, block.end_time);
                    const isAnchor = block.block_type === 'anchor';
                    const isRoutine = block.block_type === 'routine';

                    const color = isAnchor ? 'var(--color-warning)'
                        : isRoutine ? 'var(--color-future)'
                            : block.goal?.category === 'mind' ? 'var(--color-mind)'
                                : block.goal?.category === 'body' ? 'var(--color-body)'
                                    : 'var(--color-primary)';

                    return (
                        <motion.div
                            key={block.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="block-card absolute left-0 right-0 rounded-xl border p-2 flex flex-col gap-1 cursor-pointer transition-all hover:ring-2 hover:ring-white/20 group"
                            style={{
                                top,
                                height,
                                backgroundColor: `${color}15`,
                                borderColor: `${color}30`,
                                borderLeftWidth: '4px',
                                borderLeftColor: color
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onBlockClick?.(block);
                            }}
                        >
                            <div className="flex items-start justify-between gap-2 overflow-hidden">
                                <span className="text-xs font-bold truncate">
                                    {block.goal?.title || block.context || 'Untitled'}
                                </span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {block.status === 'done' ? (
                                        <Check className="w-3 h-3 text-[var(--color-success)]" />
                                    ) : block.status === 'missed' ? (
                                        <X className="w-3 h-3 text-[var(--color-error)]" />
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-tertiary)] font-mono">
                                <Clock className="w-2.5 h-2.5" />
                                <span>{block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}</span>
                            </div>

                            {/* Icons */}
                            <div className="absolute bottom-1 right-1 flex gap-1 opacity-40">
                                {isAnchor && <Anchor className="w-3 h-3" />}
                                {isRoutine && <Repeat className="w-3 h-3" />}
                                {!isAnchor && !isRoutine && block.goal_id && <Brain className="w-3 h-3" />}
                            </div>
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
            className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
            style={{ top }}
        >
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-glow ml-[60px]" />
            <div className="flex-1 h-[1px] bg-red-500/50" />
        </div>
    );
}
