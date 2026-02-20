'use client';

import { useState } from 'react';
import { X, Check, SkipForward, Clock, Trash2, Edit3, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BlockInspectorProps {
    block: any;
    onClose: () => void;
    onAction: (action: string, payload?: any) => void;
}

const PILLAR_BADGES: Record<string, { color: string; bg: string }> = {
    mind: { color: 'text-cyan-300', bg: 'bg-cyan-500/10' },
    body: { color: 'text-emerald-300', bg: 'bg-emerald-500/10' },
    craft: { color: 'text-violet-300', bg: 'bg-violet-500/10' },
    soul: { color: 'text-rose-300', bg: 'bg-rose-500/10' },
};

export function BlockInspector({ block, onClose, onAction }: BlockInspectorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editStart, setEditStart] = useState('');
    const [editEnd, setEditEnd] = useState('');

    if (!block) return null;

    const isAnchor = block.block_type === 'anchor';
    const pillar = (block.pillar || block.goal?.pillar || '').toLowerCase();
    const pillarStyle = PILLAR_BADGES[pillar];

    const startEditing = () => {
        setEditStart(block.start_time?.slice(0, 5) || '09:00');
        setEditEnd(block.end_time?.slice(0, 5) || '10:00');
        setIsEditing(true);
    };

    const saveTimeEdit = () => {
        onAction('update', {
            start_time: editStart,
            end_time: editEnd,
        });
        setIsEditing(false);
    };

    return (
        <div className="h-full flex flex-col relative">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/30 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        block.status === 'done' ? 'bg-emerald-500' :
                            block.status === 'missed' ? 'bg-red-500' :
                                'bg-white/30'
                    )} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                        {isAnchor ? 'Anchor' : block.block_type || 'Block'}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 overflow-y-auto space-y-5">

                {/* Title */}
                <div>
                    <h2 className="text-lg font-bold text-white leading-tight">
                        {block.title || block.context || 'Untitled Block'}
                    </h2>

                    {/* Pillar & Goal */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {pillarStyle && (
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md", pillarStyle.color, pillarStyle.bg)}>
                                {pillar}
                            </span>
                        )}
                        {block.goal && (
                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-md text-white/40 border border-white/5">
                                🎯 {block.goal.title}
                            </span>
                        )}
                    </div>
                </div>

                {/* Time */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-white/40">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Time</span>
                        </div>
                        {!isAnchor && (
                            <button
                                onClick={isEditing ? saveTimeEdit : startEditing}
                                className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] hover:underline"
                            >
                                {isEditing ? <><Save className="w-3 h-3" /> Save</> : <><Edit3 className="w-3 h-3" /> Edit</>}
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        <div className="flex gap-2 mt-2">
                            <input
                                type="time"
                                value={editStart}
                                onChange={(e) => setEditStart(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-[var(--color-primary)]/40"
                            />
                            <span className="text-white/30 self-center">→</span>
                            <input
                                type="time"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-[var(--color-primary)]/40"
                            />
                        </div>
                    ) : (
                        <div className="text-sm font-mono text-white/80 mt-1">
                            {block.start_time?.slice(0, 5)} – {block.end_time?.slice(0, 5)}
                        </div>
                    )}
                </div>

                {/* Status */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 text-white/40 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest">Status</span>
                    </div>
                    <span className={cn(
                        "text-sm font-bold capitalize",
                        block.status === 'done' ? 'text-emerald-400' :
                            block.status === 'missed' ? 'text-red-400' :
                                block.status === 'in_progress' ? 'text-blue-400' :
                                    'text-white/60'
                    )}>
                        {block.status || 'planned'}
                    </span>
                </div>

                {/* Quick Actions */}
                <div className="space-y-3 pt-3 border-t border-white/5">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Actions</h3>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => onAction('done')}
                            disabled={block.status === 'done'}
                            className="flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold
                                bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400
                                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <Check className="w-4 h-4" /> Done
                        </button>
                        <button
                            onClick={() => onAction('skip')}
                            disabled={block.status === 'missed'}
                            className="flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold
                                bg-amber-500/10 hover:bg-amber-500/20 text-amber-400
                                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <SkipForward className="w-4 h-4" /> Skip
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            if (isAnchor) {
                                if (window.confirm("Delete this anchor? This will permanently remove the entire recurring schedule for this commitment.")) {
                                    onAction('delete');
                                }
                            } else {
                                onAction('delete');
                            }
                        }}
                        className="w-full flex items-center justify-center gap-2 p-3 text-xs font-bold
                            text-red-500/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                    >
                        <Trash2 className="w-4 h-4" /> Delete {isAnchor ? 'Anchor' : 'Block'}
                    </button>
                </div>
            </div>
        </div>
    );
}
