'use client';

import { motion } from 'framer-motion';
import { Clock, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

interface LinearTimelineProps {
    blocks: any[];
    onStatusChange?: (blockId: string, status: string) => void;
}

export function LinearTimeline({ blocks, onStatusChange }: LinearTimelineProps) {
    const sorted = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const nowStr = new Date().toTimeString().slice(0, 5);
    
    // Get all blocks for today
    const upcoming = sorted.filter(b => b.status !== 'cancelled');

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                    <h3 className="text-sm font-semibold text-white tracking-wide">Today</h3>
                </div>
                <Link href="/app/calendar" className="text-xs font-medium text-[var(--color-primary)] hover:underline flex items-center gap-1 transition-colors">
                    Open Calendar <ArrowRight className="w-3 h-3" />
                </Link>
            </div>

            <div className="relative border-l border-[var(--glass-border)] ml-2 space-y-8 pb-4">
                {upcoming.length === 0 ? (
                    <div className="pl-6 text-sm text-[var(--text-secondary)]">
                        No blocks scheduled.
                    </div>
                ) : (
                    upcoming.map((block, index) => {
                        const isPast = block.end_time < nowStr || block.status === 'done' || block.status === 'missed';
                        const isCurrent = block.start_time <= nowStr && block.end_time > nowStr && block.status === 'planned';

                        return (
                            <motion.div 
                                key={block.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="relative pl-6 group"
                            >
                                {/* Timeline Node */}
                                <div className={`absolute -left-[5px] top-1.5 w-[9px] h-[9px] rounded-full border-2 ${
                                    isCurrent 
                                        ? 'bg-[var(--color-primary)] border-[var(--color-bg-primary)] shadow-[0_0_10px_var(--color-primary-glow)]' 
                                        : isPast 
                                            ? 'bg-[var(--glass-bg)] border-[var(--color-bg-primary)]' 
                                            : 'bg-transparent border-[var(--glass-border)] group-hover:border-[var(--glass-border)]'
                                } transition-colors`} />

                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className={`text-xs font-mono tracking-wider ${
                                                isCurrent ? 'text-[var(--color-primary)]' : 'text-[var(--text-tertiary)]'
                                            }`}>
                                                {block.start_time.slice(0, 5)}
                                            </span>
                                            <h4 className={`text-sm font-medium flex items-center gap-2 ${
                                                isPast ? 'text-[var(--text-secondary)] line-through decoration-white/20' : 'text-[var(--text-secondary)]'
                                            }`}>
                                                {block.title}
                                                {block.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70" />}
                                                {block.status === 'missed' && <XCircle className="w-3.5 h-3.5 text-red-500/70" />}
                                            </h4>
                                        </div>
                                    </div>
                                    
                                    {/* Actions */}
                                    {block.status === 'planned' && onStatusChange && (
                                        <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                            <button 
                                                onClick={() => onStatusChange(block.id, 'done')}
                                                className="p-1 text-[var(--text-tertiary)] hover:text-emerald-400 transition-colors"
                                                title="Mark Done"
                                            >
                                                <CheckCircle2 size={16} />
                                            </button>
                                            <button 
                                                onClick={() => onStatusChange(block.id, 'missed')}
                                                className="p-1 text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                                                title="Mark Incomplete"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
