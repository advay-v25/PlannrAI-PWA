'use client';

import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Check, Circle, Clock, MoreVertical, Trash2, Edit2, Play, Pause, AlertTriangle } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import type { ScheduleBlock, Goal } from '@/types/database';

interface AgendaViewProps {
    blocks: (ScheduleBlock & { goal?: Goal })[];
    onBlockClick?: (block: ScheduleBlock & { goal?: Goal }) => void;
    onStatusChange?: (blockId: string, status: 'planned' | 'done' | 'partial' | 'missed') => void;
    onDelete?: (block: ScheduleBlock) => void;
}

export function AgendaView({ blocks, onBlockClick, onStatusChange, onDelete }: AgendaViewProps) {
    const sortedBlocks = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time));

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'done': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'missed': return 'text-red-400 bg-red-400/10 border-red-400/20';
            case 'partial': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            default: return 'text-[var(--text-secondary)] bg-white/5 border-white/10';
        }
    };

    return (
        <div className="space-y-3">
            {sortedBlocks.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-tertiary)]">
                    <p>No blocks scheduled for today.</p>
                </div>
            ) : (
                sortedBlocks.map((block, index) => (
                    <motion.div
                        key={block.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                    >
                        <GlassCard
                            padding="sm"
                            className={`group relative hover:border-white/10 transition-colors ${block.status === 'done' ? 'opacity-60' : ''
                                }`}
                            onClick={() => onBlockClick?.(block)}
                        >
                            <div className="flex items-center gap-4">
                                {/* Time Column */}
                                <div className="flex flex-col items-end min-w-[60px]">
                                    <span className="text-sm font-bold font-mono text-[var(--text-primary)]">
                                        {format(new Date(block.start_time), 'HH:mm')}
                                    </span>
                                    <span className="text-xs text-[var(--text-tertiary)] font-mono">
                                        {format(new Date(block.end_time), 'HH:mm')}
                                    </span>
                                </div>

                                {/* Status Line */}
                                <div className={`w-1 h-10 rounded-full ${block.block_type === 'goal' ? 'bg-[var(--color-primary)]' :
                                        block.block_type === 'routine' ? 'bg-purple-400' :
                                            'bg-white/20'
                                    }`} />

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h4 className={`font-medium truncate ${block.status === 'done' ? 'line-through text-[var(--text-tertiary)]' : ''
                                        }`}>
                                        {block.title || block.context || 'Untitled Block'}
                                    </h4>

                                    <div className="flex items-center gap-2 mt-1">
                                        {block.goal && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 uppercase tracking-wider">
                                                {block.goal.title}
                                            </span>
                                        )}
                                        <span className="text-xs text-[var(--text-tertiary)] capitalize">
                                            {block.block_type}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {block.status !== 'done' && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStatusChange?.(block.id, 'done');
                                            }}
                                            className="p-2 rounded-lg hover:bg-emerald-400/10 text-emerald-400 transition-colors"
                                            title="Mark Complete"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                    )}

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete?.(block);
                                        }}
                                        className="p-2 rounded-lg hover:bg-red-400/10 text-red-400 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </GlassCard>
                    </motion.div>
                ))
            )}
        </div>
    );
}
