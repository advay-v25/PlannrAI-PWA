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

    const getPillarText = (block: ScheduleBlock & { goal?: Goal }) => {
        const type = block.block_type;
        if (type === 'goal' || type === 'flex') return 'text-[#B9954C] dark:text-[#D6BB80]';
        if (type === 'routine') return 'text-[#9782B5] dark:text-[#BBA9D6]';
        if (type === 'meal') return 'text-[#B97F6E] dark:text-[#D6A797]';
        if (type === 'sleep' || type === 'wind_down' || type === 'anchor') return 'text-[#6E7889] dark:text-[#9AA4B5]';
        if (type === 'break' || type === 'buffer') return 'text-[#8F8C84] dark:text-[#8B8B96]';
        const pillar = block.pillar?.toLowerCase() || block.goal?.pillar?.toLowerCase();
        if (pillar === 'mind') return 'text-[#7C6FC0] dark:text-[#A99CE0]';
        if (pillar === 'body') return 'text-[#5F9377] dark:text-[#8FBFA3]';
        if (pillar === 'craft') return 'text-[#B9954C] dark:text-[#D6BB80]';
        return 'text-[#7C6FC0] dark:text-[#A99CE0]';
    };

    const getPillarBg = (block: ScheduleBlock & { goal?: Goal }) => {
        const type = block.block_type;
        if (type === 'goal' || type === 'flex') return 'bg-[#B9954C] dark:bg-[#D6BB80]';
        if (type === 'routine') return 'bg-[#9782B5] dark:bg-[#BBA9D6]';
        if (type === 'meal') return 'bg-[#B97F6E] dark:bg-[#D6A797]';
        if (type === 'sleep' || type === 'wind_down' || type === 'anchor') return 'bg-[#6E7889] dark:bg-[#9AA4B5]';
        if (type === 'break' || type === 'buffer') return 'bg-[#8F8C84] dark:bg-[#8B8B96]';
        const pillar = block.pillar?.toLowerCase() || block.goal?.pillar?.toLowerCase();
        if (pillar === 'mind') return 'bg-[#7C6FC0] dark:bg-[#A99CE0]';
        if (pillar === 'body') return 'bg-[#5F9377] dark:bg-[#8FBFA3]';
        if (pillar === 'craft') return 'bg-[#B9954C] dark:bg-[#D6BB80]';
        return 'bg-[#7C6FC0] dark:text-[#A99CE0]';
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
                            className={`group relative hover:border-[#E7E4DC] dark:hover:border-[#2A2A31] transition-colors bg-[#FFFFFF] dark:bg-[#1B1B20] border border-[#E7E4DC] dark:border-[#2A2A31] ${block.status === 'done' ? 'opacity-60' : ''
                                }`}
                            onClick={() => onBlockClick?.(block)}
                        >
                            <div className="flex items-center gap-4">
                                {/* Time Column */}
                                <div className="flex flex-col items-end min-w-[60px]">
                                    <span className="text-sm font-bold font-mono text-[#8F8C84] dark:text-[#8B8B96]">
                                        {format(new Date(block.start_time), 'HH:mm')}
                                    </span>
                                    <span className="text-xs font-mono text-[#8F8C84] dark:text-[#8B8B96]">
                                        {format(new Date(block.end_time), 'HH:mm')}
                                    </span>
                                </div>

                                {/* Status Line */}
                                <div className={`w-1 h-10 rounded-full ${getPillarBg(block)}`} />

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h4 className={`font-medium truncate ${block.status === 'done' ? 'line-through text-[var(--text-tertiary)]' : getPillarText(block)
                                        }`}>
                                        {block.title || block.context || 'Untitled Block'}
                                    </h4>

                                    <div className="flex items-center gap-2 mt-1">
                                        {block.goal && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#B9954C]/10 text-[#B9954C] dark:text-[#D6BB80] border border-[#B9954C]/20 uppercase tracking-wider">
                                                {block.goal.title}
                                            </span>
                                        )}
                                        <span className={`text-xs capitalize ${getPillarText(block)}`}>
                                            {block.block_type}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
