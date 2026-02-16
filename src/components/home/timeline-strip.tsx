'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Lock, Coffee, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface TimelineStripProps {
    blocks: any[];
    anchors?: any[];
}

export function TimelineStrip({ blocks, anchors = [] }: TimelineStripProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const now = new Date();

    // Sort blocks by time
    const sorted = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time));

    // Calculate position of 'now' indicator
    // This is a simplified version, ideally we map time to x-position

    return (
        <div className="w-full space-y-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Timeline</h3>
                <Link href="/app/calendar" className="text-[10px] text-white/40 hover:text-white transition-colors">
                    Open Calendar →
                </Link>
            </div>

            <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-none mask-fade-sides"
            >
                {/* Spacer for start */}
                <div className="w-2 shrink-0" />

                {sorted.length === 0 ? (
                    <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-white/10 px-8 text-xs text-white/30">
                        Nothing scheduled for the rest of the day.
                    </div>
                ) : (
                    sorted.map((block) => {
                        const isPast = block.end_time < now.toTimeString().slice(0, 5);
                        const isCurrent = block.start_time <= now.toTimeString().slice(0, 5) && block.end_time > now.toTimeString().slice(0, 5);

                        return (
                            <Link
                                key={block.id}
                                href={`/app/calendar?date=${block.date}`}
                                className="snap-start"
                            >
                                <motion.div
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    className={cn(
                                        "relative flex h-24 w-40 shrink-0 flex-col justify-between rounded-2xl border p-3 transition-all",
                                        isCurrent
                                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.2)]"
                                            : isPast
                                                ? "border-white/5 bg-white/5 opacity-50 grayscale"
                                                : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                                    )}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className={cn(
                                            "text-[10px] font-mono",
                                            isCurrent ? "text-[var(--color-primary)] font-bold" : "text-white/40"
                                        )}>
                                            {block.start_time.slice(0, 5)}
                                        </span>
                                        {block.block_type === 'anchor' && <Lock className="h-3 w-3 text-white/20" />}
                                    </div>

                                    <div>
                                        <div className="text-xs font-medium text-white line-clamp-2 leading-tight">
                                            {block.title}
                                        </div>
                                        {block.goal?.category && (
                                            <div className={cn(
                                                "mt-1 h-0.5 w-6 rounded-full",
                                                block.goal.category === 'mind' ? 'bg-blue-400' :
                                                    block.goal.category === 'body' ? 'bg-green-400' :
                                                        block.goal.category === 'craft' ? 'bg-purple-400' : 'bg-white/20'
                                            )} />
                                        )}
                                    </div>
                                </motion.div>
                            </Link>
                        );
                    })
                )}

                {/* Spacer for end */}
                <div className="w-2 shrink-0" />
            </div>
        </div>
    );
}
