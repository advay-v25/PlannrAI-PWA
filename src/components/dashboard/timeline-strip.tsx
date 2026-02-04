'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Check, X, Clock, Sparkles } from 'lucide-react';
import type { ScheduleBlock, Goal } from '@/types/database';

interface TimelineStripProps {
    blocks: ScheduleBlock[];
    onBlockClick?: (block: ScheduleBlock) => void;
}

export function TimelineStrip({ blocks, onBlockClick }: TimelineStripProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const nowRef = useRef<HTMLDivElement>(null);

    // Find current block index
    const now = new Date();
    const currentIndex = blocks.findIndex(b => {
        const start = new Date(`${b.date}T${b.start_time}`);
        const end = new Date(`${b.date}T${b.end_time}`);
        return now >= start && now < end;
    });

    // Find next block if no current
    const nextIndex = currentIndex === -1
        ? blocks.findIndex(b => new Date(`${b.date}T${b.start_time}`) > now)
        : -1;

    const activeIndex = currentIndex !== -1 ? currentIndex : nextIndex;

    // Scroll to current/next block on mount
    useEffect(() => {
        if (nowRef.current && scrollRef.current) {
            const container = scrollRef.current;
            const element = nowRef.current;
            const containerWidth = container.offsetWidth;
            const elementLeft = element.offsetLeft;
            const elementWidth = element.offsetWidth;

            // Center the element
            container.scrollTo({
                left: elementLeft - (containerWidth / 2) + (elementWidth / 2),
                behavior: 'smooth'
            });
        }
    }, [activeIndex]);

    if (blocks.length === 0) {
        return (
            <div className="py-4 text-center text-[var(--text-tertiary)]">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No blocks scheduled</p>
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Gradient Fades */}
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[var(--glass-bg)] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[var(--glass-bg)] to-transparent z-10 pointer-events-none" />

            {/* Scrollable Timeline */}
            <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto scrollbar-hide py-2 px-4 -mx-4"
                style={{ scrollSnapType: 'x mandatory' }}
            >
                {blocks.map((block, index) => {
                    const isPast = new Date(`${block.date}T${block.end_time}`) < now;
                    const isCurrent = index === currentIndex;
                    const isNext = index === nextIndex;
                    const isActive = isCurrent || isNext;
                    const goal = block.goal as Goal | undefined;

                    // Pillar color
                    const pillarColor = goal?.category === 'mind' ? 'var(--color-mind)'
                        : goal?.category === 'body' ? 'var(--color-body)'
                            : goal?.category === 'craft' ? 'var(--color-craft)'
                                : 'var(--color-primary)';

                    return (
                        <motion.div
                            key={block.id}
                            ref={isActive ? nowRef : undefined}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex-shrink-0"
                            style={{ scrollSnapAlign: 'center' }}
                        >
                            <div
                                onClick={() => onBlockClick?.(block)}
                                className={`
                                    relative p-4 rounded-2xl border transition-all cursor-pointer
                                    ${isActive
                                        ? 'w-48 bg-white/10 border-[var(--color-primary)]/50 ring-2 ring-[var(--color-primary)]/30'
                                        : 'w-32 bg-white/5 border-white/5 hover:bg-white/10'
                                    }
                                    ${isPast ? 'opacity-50' : ''}
                                    ${block.status === 'done' ? 'border-[var(--color-success)]/30' : ''}
                                `}
                            >
                                {/* Status Badge */}
                                {block.status === 'done' && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--color-success)] flex items-center justify-center">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                {block.status === 'missed' && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--color-error)] flex items-center justify-center">
                                        <X className="w-3 h-3 text-white" />
                                    </div>
                                )}

                                {/* Current Indicator */}
                                {isCurrent && (
                                    <div className="absolute -top-1 -left-1">
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-primary)]"></span>
                                        </span>
                                    </div>
                                )}

                                {/* Pillar Indicator */}
                                <div
                                    className="w-1 h-6 rounded-full mb-2"
                                    style={{ backgroundColor: pillarColor }}
                                />

                                {/* Time */}
                                <p className={`font-mono text-xs mb-1 ${isPast ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}>
                                    {block.start_time.slice(0, 5)}
                                </p>

                                {/* Title */}
                                <p className={`font-medium text-sm truncate ${isActive ? '' : 'text-[var(--text-secondary)]'}`}>
                                    {goal?.title || block.context || 'Block'}
                                </p>

                                {/* Extended Info for Active */}
                                {isActive && (
                                    <div className="mt-2 pt-2 border-t border-white/10">
                                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                                            <Clock className="w-3 h-3" />
                                            <span>{block.start_time.slice(0, 5)} → {block.end_time.slice(0, 5)}</span>
                                        </div>
                                        {goal?.ai_strategy && (
                                            <div className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] mt-1">
                                                <Sparkles className="w-3 h-3" />
                                                <span>Strategy Active</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
