'use client';

import { useState } from 'react';
import { X, Check, SkipForward, Split, MessageSquare, Clock, Trash2, Repeat } from 'lucide-react';
import { motion } from 'framer-motion';
import { GlassButton } from '@/components/ui/glass-button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface BlockInspectorProps {
    block: any;
    onClose: () => void;
    onAction: (action: string, payload?: any) => void;
}

export function BlockInspector({ block, onClose, onAction }: BlockInspectorProps) {
    if (!block) return null;

    const isAnchor = block.block_type === 'anchor';
    const isPast = new Date(`${block.date}T${block.end_time}`) < new Date();

    return (
        <div className="h-full flex flex-col relative">
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-black/20 backdrop-blur-xl z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    {isAnchor ? 'Locked Commitment' : 'Flexible Block'}
                </span>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-5 overflow-y-auto space-y-6">

                {/* Title & Time */}
                <div>
                    <h2 className="text-xl font-bold text-white leading-tight mb-2">
                        {block.context || block.title || 'Untitled Block'}
                    </h2>
                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                        <Clock className="w-4 h-4" />
                        <span className="font-mono">
                            {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                        </span>
                    </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(block.status)}`} />
                    <span className="text-xs font-medium text-white/80 capitalize">
                        {block.status || 'Scheduled'}
                    </span>
                    {block.goal && (
                        <span className="ml-auto text-[10px] bg-white/10 px-2 py-0.5 rounded-md text-white/50">
                            {block.goal.title}
                        </span>
                    )}
                </div>

                {/* Actions */}
                <div className="space-y-4 pt-4 border-t border-white/5">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Quick Actions</h3>

                    <div className="grid grid-cols-2 gap-2">
                        <ActionButton
                            icon={<Check className="w-4 h-4" />}
                            label="Complete"
                            onClick={() => onAction('done')}
                            variant="success"
                        />
                        <ActionButton
                            icon={<SkipForward className="w-4 h-4" />}
                            label="Skip"
                            onClick={() => onAction('skip')}
                            variant="warning"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <ActionButton
                            icon={<Split className="w-4 h-4" />}
                            label="Split"
                            onClick={() => onAction('split')}
                        />
                        <ActionButton
                            icon={<Repeat className="w-4 h-4" />}
                            label="Repeat"
                            onClick={() => onAction('repeat')}
                        />
                    </div>

                    <ActionButton
                        icon={<MessageSquare className="w-4 h-4" />}
                        label="Ask Coach about this"
                        onClick={() => onAction('coach')}
                        variant="primary"
                        className="w-full"
                    />

                    {!isAnchor && (
                        <button
                            onClick={() => onAction('delete')}
                            className="w-full mt-4 flex items-center justify-center gap-2 p-3 text-xs font-bold text-red-500/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                            <Trash2 className="w-4 h-4" /> Delete Block
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function ActionButton({ icon, label, onClick, variant = 'default', className }: any) {
    const variants: any = {
        default: "bg-white/5 hover:bg-white/10 text-white/60 hover:text-white",
        success: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500",
        warning: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-500",
        primary: "bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
    };

    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold transition-all border border-transparent",
                variants[variant],
                className
            )}
        >
            {icon}
            {label}
        </button>
    )
}

function getStatusColor(status: string) {
    switch (status) {
        case 'done': return 'bg-emerald-500';
        case 'missed': return 'bg-red-500';
        case 'in_progress': return 'bg-blue-500';
        default: return 'bg-white/20';
    }
}
