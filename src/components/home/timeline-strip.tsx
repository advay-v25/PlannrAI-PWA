'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface TimelineStripProps {
    blocks: any[];
    anchors?: any[];
}

export function TimelineStrip({ blocks, anchors = [] }: TimelineStripProps) {
    const [currentTime, setCurrentTime] = useState(new Date().toTimeString().slice(0, 5));

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date().toTimeString().slice(0, 5));
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    // Sort blocks chronologically
    const sorted = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time));

    // Filter to show: the current block, and upcoming blocks. Hide old ones (except maybe the very last one missed)
    const upcomingBlocks = sorted.filter(b => b.end_time > currentTime).slice(0, 4);

    return (
        <div className="w-full rounded-3xl border border-white/5 bg-black/40 backdrop-blur-xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white tracking-wide">Up Next</h3>
                </div>
                <Link href="/app/calendar" className="text-xs font-medium text-white/50 hover:text-white flex items-center gap-1 transition-colors bg-white/5 px-2.5 py-1 rounded-full">
                    Open Calendar <ArrowRight className="w-3 h-3" />
                </Link>
            </div>

            <div className="relative space-y-3">
                {upcomingBlocks.length === 0 ? (
                    <div className="flex h-24 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center">
                        <span className="text-xs text-white/40">Schedule is clear for the rest of the day.</span>
                        <Link href="/app/calendar" className="text-[10px] mt-2 text-[var(--color-primary)]">Plan Tomorrow →</Link>
                    </div>
                ) : (
                    upcomingBlocks.map((block, index) => {
                        const isCurrent = block.start_time <= currentTime && block.end_time > currentTime;

                        return (
                            <Link key={block.id} href={`/app/calendar?date=${block.date}`} className="block">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    whileHover={{ scale: 1.01, x: 2 }}
                                    className={cn(
                                        "group relative flex items-stretch gap-3 rounded-2xl p-3 outline-none transition-all",
                                        isCurrent
                                            ? "bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/30 backdrop-blur-md shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.1)]"
                                            : "hover:bg-white/[0.03] ring-1 ring-white/5 bg-black/20"
                                    )}
                                >
                                    {/* Timeline Line & Indicator */}
                                    <div className="flex flex-col items-center gap-1 min-w-[48px]">
                                        <span className={cn(
                                            "text-xs font-bold font-mono",
                                            isCurrent ? "text-[var(--color-primary)]" : "text-white/50"
                                        )}>
                                            {format(new Date(`2000-01-01T${block.start_time}`), 'h:mm a')}
                                        </span>
                                        <div className="flex-1 w-[2px] rounded-full bg-white/5 relative">
                                            {isCurrent && (
                                                <div className="absolute top-0 w-[2px] bg-[var(--color-primary)] rounded-full animate-pulse h-full" />
                                            )}
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 pb-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-col">
                                                <span className={cn(
                                                    "text-sm font-semibold truncate",
                                                    isCurrent ? "text-white" : "text-white/80"
                                                )}>
                                                    {block.title}
                                                </span>
                                                <span className="text-[10px] text-white/40 font-mono mt-0.5">
                                                    {block.end_time.slice(0, 5)} {block.pillar ? `• ${block.pillar.toUpperCase()}` : ''}
                                                </span>
                                            </div>
                                            {block.block_type === 'anchor' && (
                                                <Lock className="w-3.5 h-3.5 text-white/20 shrink-0" />
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </Link>
                        );
                    })
                )}
            </div>
        </div>
    );
}
