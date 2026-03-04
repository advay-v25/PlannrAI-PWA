'use client';

import { useState } from 'react';
import {
    X, Check, SkipForward, Clock, Trash2, Edit3, Save, ListTodo,
    Circle, CheckCircle2, Sparkles, Loader2, Pencil, Tag, AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useHabitStacksStore } from '@/stores';

interface BlockInspectorProps {
    block: any;
    onClose: () => void;
    onAction: (action: string, payload?: any) => void;
}

const PILLAR_COLORS: Record<string, { accent: string; bg: string; border: string }> = {
    mind: { accent: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    body: { accent: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    craft: { accent: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    soul: { accent: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
};

const BLOCK_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
    focus: { label: 'Focus', icon: '🎯', color: 'text-blue-400' },
    routine: { label: 'Routine', icon: '🔄', color: 'text-purple-400' },
    meal: { label: 'Meal', icon: '🍽', color: 'text-orange-400' },
    body: { label: 'Body', icon: '💪', color: 'text-emerald-400' },
    mind: { label: 'Mind', icon: '🧠', color: 'text-indigo-400' },
    craft: { label: 'Craft', icon: '⚡', color: 'text-amber-400' },
    break: { label: 'Break', icon: '☕', color: 'text-gray-400' },
    task: { label: 'Task', icon: '📋', color: 'text-blue-300' },
    anchor: { label: 'Anchor', icon: '📌', color: 'text-slate-400' },
    sleep: { label: 'Sleep', icon: '😴', color: 'text-gray-500' },
};

export function BlockInspector({ block, onClose, onAction }: BlockInspectorProps) {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [isEditingTime, setIsEditingTime] = useState(false);
    const [editStart, setEditStart] = useState('');
    const [editEnd, setEditEnd] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const { stacks, completeStack } = useHabitStacksStore();

    if (!block) return null;

    const isAnchor = block.block_type === 'anchor' || block.id?.startsWith('virt-cmt-');
    const pillar = (block.pillar || block.goal?.pillar || '').toLowerCase();
    const pillarStyle = PILLAR_COLORS[pillar];
    const blockMeta = BLOCK_TYPE_META[block.block_type] || BLOCK_TYPE_META.task;
    const isDone = block.status === 'done';
    const isMissed = block.status === 'missed';

    // Time calculations
    const [sh, sm] = (block.start_time || '00:00').split(':').map(Number);
    const [eh, em] = (block.end_time || '01:00').split(':').map(Number);
    const durationMins = (eh * 60 + em) - (sh * 60 + sm);

    // Related habit stacks
    const blockTitle = (block.title || block.context || '').toLowerCase();
    const relatedStacks = stacks.filter(s =>
        s.is_active && (
            (blockTitle && s.trigger_habit.toLowerCase().includes(blockTitle)) ||
            (blockTitle && blockTitle.includes(s.trigger_habit.toLowerCase())) ||
            (block.goal_id && s.goal_id === block.goal_id)
        )
    );
    const checklist = block.checklist || [];
    const checklistDone = checklist.filter((c: any) => c.completed).length;
    const hasSubTasks = relatedStacks.length > 0 || checklist.length > 0;

    // Handlers
    const startEditingTitle = () => {
        setEditTitle(block.title || block.context || '');
        setIsEditingTitle(true);
    };
    const saveTitleEdit = () => {
        if (editTitle.trim()) {
            onAction('update', { title: editTitle.trim() });
        }
        setIsEditingTitle(false);
    };
    const startEditingTime = () => {
        setEditStart(block.start_time?.slice(0, 5) || '09:00');
        setEditEnd(block.end_time?.slice(0, 5) || '10:00');
        setIsEditingTime(true);
    };
    const saveTimeEdit = () => {
        onAction('update', { start_time: editStart, end_time: editEnd });
        setIsEditingTime(false);
    };

    const generateSubtasks = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch('/api/calendar/generate-checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    block_id: block.id?.startsWith('virt-') ? undefined : block.id,
                    title: block.title || block.context || 'Block',
                    block_type: block.block_type,
                    goal_title: block.goal?.title,
                    duration_minutes: durationMins,
                }),
            });
            if (res.ok) {
                const json = await res.json();
                const newChecklist = json.data?.checklist || json.checklist || [];
                if (newChecklist.length > 0) {
                    onAction('update', { checklist: newChecklist });
                }
            }
        } catch (e) {
            console.error('Failed to generate sub-tasks:', e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header — accent colored */}
            <div className={cn(
                "px-5 py-4 flex items-start justify-between",
                pillarStyle ? pillarStyle.bg : 'bg-zinc-800/50',
                "border-b",
                pillarStyle ? pillarStyle.border : 'border-white/5'
            )}>
                <div className="flex-1 min-w-0">
                    {/* Block type tag */}
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{blockMeta.icon}</span>
                        <span className={cn("text-[10px] font-bold uppercase tracking-widest", blockMeta.color)}>
                            {blockMeta.label}
                        </span>
                        {isDone && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">DONE</span>}
                        {isMissed && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">MISSED</span>}
                    </div>

                    {/* Title — editable */}
                    {isEditingTitle ? (
                        <div className="flex gap-2">
                            <input
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveTitleEdit()}
                                className="flex-1 bg-black/30 border border-white/20 rounded-lg px-3 py-1.5 text-white
                                    text-base font-bold focus:outline-none focus:border-white/40"
                                autoFocus
                            />
                            <button onClick={saveTitleEdit} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white">
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-start gap-2 group">
                            <h2 className="text-lg font-bold text-white leading-tight truncate">
                                {block.title || block.context || 'Untitled Block'}
                            </h2>
                            {!isAnchor && (
                                <button onClick={startEditingTitle}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all shrink-0">
                                    <Pencil className="w-3.5 h-3.5 text-white/40" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Goal link */}
                    {block.goal && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/40">
                            <span>🎯</span>
                            <span>{block.goal.title}</span>
                        </div>
                    )}

                    {/* Pillar badge */}
                    {pillarStyle && (
                        <span className={cn("inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md", pillarStyle.accent, pillarStyle.bg)}>
                            {pillar}
                        </span>
                    )}
                </div>

                <button onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-black/20 text-white/40 hover:text-white transition-colors shrink-0 ml-2">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-5 space-y-4">

                    {/* Time — clean card */}
                    <div className="p-4 rounded-xl bg-zinc-800/40 border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-white/50">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Time</span>
                            </div>
                            {!isAnchor && (
                                <button onClick={isEditingTime ? saveTimeEdit : startEditingTime}
                                    className="flex items-center gap-1 text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors">
                                    {isEditingTime ? <><Save className="w-3 h-3" /> Save</> : <><Edit3 className="w-3 h-3" /> Edit</>}
                                </button>
                            )}
                        </div>

                        {isEditingTime ? (
                            <div className="flex items-center gap-2">
                                <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-violet-500/40" />
                                <span className="text-white/30 text-sm">→</span>
                                <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-violet-500/40" />
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-3">
                                <span className="text-xl font-bold text-white font-mono tracking-tight">
                                    {block.start_time?.slice(0, 5)}
                                </span>
                                <span className="text-white/20">→</span>
                                <span className="text-xl font-bold text-white font-mono tracking-tight">
                                    {block.end_time?.slice(0, 5)}
                                </span>
                                <span className="text-xs text-white/30 font-mono ml-auto">
                                    {durationMins}min
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Checklist / Habit Stacks */}
                    {hasSubTasks && (
                        <div className="rounded-xl bg-zinc-800/40 border border-white/5 overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
                                <div className="flex items-center gap-2 text-white/50">
                                    <ListTodo className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">
                                        Action Steps
                                    </span>
                                </div>
                                {checklist.length > 0 && (
                                    <span className="text-[10px] font-mono text-white/30">
                                        {checklistDone}/{checklist.length}
                                    </span>
                                )}
                            </div>

                            <div className="p-2 space-y-0.5">
                                {checklist.map((item: any, i: number) => (
                                    <button
                                        key={`task-${i}`}
                                        onClick={() => {
                                            const newChecklist = [...checklist];
                                            newChecklist[i] = { ...item, completed: !item.completed };
                                            onAction('update', { checklist: newChecklist });
                                        }}
                                        className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg
                                            hover:bg-white/5 transition-colors text-left"
                                    >
                                        {item.completed ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                        ) : (
                                            <Circle className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />
                                        )}
                                        <span className={cn(
                                            "text-sm leading-tight",
                                            item.completed ? "text-white/30 line-through" : "text-white/80"
                                        )}>
                                            {item.text}
                                        </span>
                                    </button>
                                ))}

                                {relatedStacks.map(stack => {
                                    const isCompleted = stack.last_completed === new Date().toISOString().split('T')[0];
                                    return (
                                        <button
                                            key={stack.id}
                                            onClick={() => !isCompleted && completeStack(stack.id)}
                                            disabled={isCompleted}
                                            className={cn(
                                                "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-colors text-left",
                                                "bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/10"
                                            )}
                                        >
                                            {isCompleted ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                            ) : (
                                                <Circle className="w-4 h-4 text-violet-400/50 shrink-0 mt-0.5" />
                                            )}
                                            <div className={cn("flex flex-col", isCompleted && "opacity-40 line-through")}>
                                                <span className="text-sm text-white">{stack.action_habit}</span>
                                                <span className="text-[10px] text-violet-400/60">{stack.action_duration_mins}m • Habit Stack</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Generate Sub-tasks (when empty) */}
                    {!hasSubTasks && block.block_type !== 'sleep' && block.block_type !== 'break' && block.block_type !== 'meal' && (
                        <button
                            onClick={generateSubtasks}
                            disabled={isGenerating}
                            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl text-sm font-bold
                                bg-gradient-to-r from-violet-600/10 to-indigo-600/10
                                border border-violet-500/20 text-violet-400
                                hover:from-violet-600/20 hover:to-indigo-600/20
                                disabled:opacity-50 disabled:cursor-wait transition-all"
                        >
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                            ) : (
                                <><Sparkles className="w-4 h-4" /> Generate Action Steps</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Actions — bottom pinned */}
            <div className="shrink-0 border-t border-white/5 bg-zinc-900/80 backdrop-blur-sm p-4 space-y-2">
                {/* Status actions */}
                {!isAnchor && (
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => onAction('done')}
                            disabled={isDone}
                            className={cn(
                                "flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all",
                                isDone
                                    ? "bg-emerald-500/20 text-emerald-400 opacity-50 cursor-not-allowed"
                                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 active:scale-95"
                            )}
                        >
                            <Check className="w-4 h-4" /> Done
                        </button>
                        <button
                            onClick={() => onAction('skip')}
                            disabled={isMissed}
                            className={cn(
                                "flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all",
                                isMissed
                                    ? "bg-amber-500/20 text-amber-400 opacity-50 cursor-not-allowed"
                                    : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 active:scale-95"
                            )}
                        >
                            <SkipForward className="w-4 h-4" /> Skip
                        </button>
                    </div>
                )}

                {/* Delete */}
                <button
                    onClick={() => {
                        const label = isAnchor ? 'anchor commitment' : 'block';
                        const extra = isAnchor ? ' This will permanently remove it from ALL days.' : '';
                        if (window.confirm(`Delete this ${label}?${extra}`)) {
                            onAction('delete');
                        }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold
                        text-red-500/50 hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isAnchor ? 'Delete Anchor Permanently' : 'Delete Block'}
                </button>

                {/* Anchor warning */}
                {isAnchor && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500/60 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-amber-400/60 leading-tight">
                            This is a fixed commitment. Deleting removes it from your entire schedule permanently.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
