'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock, Sparkles, ChevronRight } from 'lucide-react';
import type { ScheduleBlock, Goal } from '@/types/database';

interface TimelineStripProps {
    blocks: (ScheduleBlock & { goal?: Goal | null })[];
    onBlockClick?: (block: ScheduleBlock & { goal?: Goal | null }) => void;
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

    // Scroll active block into view on mount/update
    useEffect(() => {
        if (nowRef.current && scrollRef.current) {
            const container = scrollRef.current;
            const element = nowRef.current;
            const containerWidth = container.offsetWidth;
            const elementLeft = element.offsetLeft;
            const elementWidth = element.offsetWidth;

            container.scrollTo({
                left: elementLeft - (containerWidth / 2) + (elementWidth / 2),
                behavior: 'smooth'
            });
        }
    }, [activeIndex]);

    if (blocks.length === 0) {
        return (
            <div className="py-8 text-center border border-dashed border-[var(--glass-border)] rounded-2xl bg-[var(--glass-bg)]">
                <Clock className="w-8 h-8 mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-sm text-[var(--text-secondary)]">No blocks scheduled for today.</p>
            </div>
        );
    }

    return (
        <div className="relative group">
            {/* Gradient Fade Masks */}
            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[var(--color-bg-primary)] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[var(--color-bg-primary)] to-transparent z-10 pointer-events-none" />

            {/* Scroll Container */}
            <div
                ref={scrollRef}
                className="flex gap-4 overflow-x-auto pb-6 px-4 pt-2 -mx-4 scrollbar-hide snap-x snap-mandatory"
            >
                {blocks.map((block, index) => {
                    const isPast = new Date(`${block.date}T${block.end_time}`) < now;
                    const isCurrent = index === currentIndex;
                    const isNext = index === nextIndex;
                    const isActive = isCurrent || isNext;
                    const goal = block.goal;

                    // Neural Category Colors
                    const accentColor =
                        goal?.category === 'mind' ? 'var(--color-mind)' :
                            goal?.category === 'body' ? 'var(--color-body)' :
                                goal?.category === 'craft' ? 'var(--color-primary)' : // craft uses primary orange
                                    'var(--color-primary)';

                    return (
                        <motion.div
                            key={block.id}
                            ref={isActive ? nowRef : undefined}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{
                                opacity: isPast ? 0.5 : 1,
                                scale: isActive ? 1 : 0.95
                            }}
                            className="snap-center flex-shrink-0"
                        >
                            <div
                                onClick={() => onBlockClick?.(block)}
                                className={`
                                    relative p-4 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden
                                    ${isActive
                                        ? 'w-64 bg-[var(--glass-bg-hover)] border-[var(--color-primary)]/30 ring-1 ring-[var(--color-primary)]/20 shadow-[0_4px_20px_-5px_rgba(0,0,0,0.3)]'
                                        : 'w-48 bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]'
                                    }
                                `}
                            >
                                {/* Active 'Flow' Background */}
                                {isCurrent && (
                                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent pointer-events-none" />
                                )}

                                <div className="relative z-10 flex flex-col h-full justify-between gap-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            {/* Status Dot */}
                                            {isCurrent ? (
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-primary)]"></span>
                                                </span>
                                            ) : (
                                                <div
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: block.status === 'done' ? 'var(--color-success)' : accentColor }}
                                                />
                                            )}

                                            <span className="font-mono text-xs text-[var(--text-tertiary)]">
                                                {block.start_time.slice(0, 5)}
                                            </span>
                                        </div>

                                        {block.status === 'done' && <Check className="w-4 h-4 text-[var(--color-success)]" />}
                                    </div>

                                    <div>
                                        <h4 className={`font-medium leading-tight line-clamp-2 ${isActive ? 'text-base text-[var(--text-primary)]' : 'text-sm text-[var(--text-secondary)]'}`}>
                                            {goal?.title || block.context || 'Focus Block'}
                                        </h4>
                                        {goal?.category && (
                                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-1 block">
                                                {goal.category}
                                            </span>
                                        )}
                                    </div>

                                    {/* Footer Info for Active Card */}
                                    {isActive && (
                                        <div className="pt-3 mt-1 border-t border-[var(--glass-border)] flex items-center justify-between">
                                            <span className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {block.end_time.slice(0, 5)}
                                            </span>
                                            {goal?.ai_strategy && (
                                                <Sparkles className="w-3 h-3 text-[var(--color-primary)]" />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
