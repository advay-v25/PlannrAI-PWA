'use client';

import { useState } from 'react';
import {
    X, Check, SkipForward, Clock, Trash2, Edit3, Save, ListTodo,
    Circle, CheckCircle2, Sparkles, Loader2, Pencil, Tag, AlertTriangle,
    Lock, Unlock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useHabitStacksStore } from '@/stores';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';
import { apiClient } from '@/lib/api-client';

interface BlockInspectorProps {
    block: any;
    onClose: () => void;
    onAction: (action: string, payload?: any) => void;
}

const PILLAR_COLORS: Record<string, { accent: string; bg: string; border: string }> = {
    mind: { accent: 'text-purple-700 dark:text-indigo-400', bg: 'bg-gradient-to-br from-purple-500/20 to-indigo-500/10 dark:bg-indigo-500/10', border: 'border-purple-500/30 dark:border-indigo-500/20' },
    body: { accent: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10 dark:bg-emerald-500/10', border: 'border-emerald-500/30 dark:border-emerald-500/20' },
    craft: { accent: 'text-amber-700 dark:text-amber-400', bg: 'bg-gradient-to-br from-amber-500/20 to-orange-500/10 dark:bg-amber-500/10', border: 'border-amber-500/30 dark:border-amber-500/20' },
    soul: { accent: 'text-rose-700 dark:text-rose-400', bg: 'bg-gradient-to-br from-rose-400/20 to-rose-400/10 dark:bg-rose-500/10', border: 'border-rose-500/30 dark:border-rose-500/20' },
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
    const [confirmingDelete, setConfirmingDelete] = useState(false);
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
            const res = await apiClient.post<any>('/api/calendar/generate-checklist', {
                block_id: block.id?.startsWith('virt-') ? undefined : block.id,
                title: block.title || block.context || 'Block',
                block_type: block.block_type,
                goal_title: block.goal?.title,
                duration_minutes: durationMins,
            });
            if (res?.checklist) {
                const newChecklist = res.checklist || [];
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
        <div className="h-full flex flex-col glass-panel-elevated">
            {/* Header — accent colored */}
            <div className={cn(
                "px-5 py-4 flex items-start justify-between",
                pillarStyle.bg,
                pillarStyle.border,
                "border-b"
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
                                className="flex-1 bg-[var(--glass-bg)] border border-white/20 rounded-lg px-3 py-1.5 text-[var(--text-primary)]
                                    text-base font-bold focus:outline-none focus:border-white/40"
                                autoFocus
                            />
                            <button onClick={saveTitleEdit} className="p-1.5 rounded-lg bg-[var(--glass-bg)] hover:bg-white/20 text-[var(--text-primary)]">
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-start gap-2 group">
                            <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight truncate">
                                {block.title || block.context || 'Untitled Block'}
                            </h2>
                            {!isAnchor && (
                                <button onClick={startEditingTitle}
                                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded hover:bg-[var(--glass-bg)] transition-all shrink-0">
                                    <Pencil className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Goal link */}
                    {block.goal && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
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
                    className="p-1.5 rounded-lg hover:bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0 ml-2">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-5 space-y-4">

                    {/* Time — clean card */}
                    <div className="p-4 rounded-xl glass-panel">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
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
                                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-purple-500/30" />
                                <span className="text-[var(--text-tertiary)] text-sm">→</span>
                                <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-purple-500/30" />
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-3">
                                <span className="text-xl font-bold text-[var(--text-primary)] font-mono tracking-tight">
                                    {block.start_time?.slice(0, 5)}
                                </span>
                                <span className="text-[var(--text-tertiary)]">→</span>
                                <span className="text-xl font-bold text-[var(--text-primary)] font-mono tracking-tight">
                                    {block.end_time?.slice(0, 5)}
                                </span>
                                <span className="text-xs text-[var(--text-tertiary)] font-mono ml-auto">
                                    {durationMins}min
                                </span>
                            </div>
                        )}
                    </div>

                    {/* AI Expert Strategy (if available) */}
                    {block.goal?.ai_strategy && (
                        <div className="rounded-xl glass-panel overflow-hidden border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-transparent">
                            <div className="px-4 py-3 flex items-center gap-2 text-purple-200 border-b border-purple-500/10">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                    AI Expert Strategy
                                </span>
                            </div>
                            <div className="p-4 space-y-3">
                                <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                                    "{block.goal.ai_strategy.strategy_one_liner}"
                                </p>
                                {block.goal.ai_strategy.routine?.steps && (
                                    <div className="space-y-1.5 pt-1">
                                        {block.goal.ai_strategy.routine.steps.map((step: string, idx: number) => (
                                            <div key={idx} className="flex gap-2 text-xs">
                                                <span className="text-purple-400 font-mono font-bold">{idx + 1}.</span>
                                                <span className="text-white/80">{step}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Checklist / Habit Stacks */}
                    {hasSubTasks && (
                        <div className="rounded-xl glass-panel overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
                                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                    <ListTodo className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">
                                        Action Steps
                                    </span>
                                </div>
                                {checklist.length > 0 && (
                                    <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                                        {checklistDone}/{checklist.length}
                                    </span>
                                )}
                            </div>

                            <div className="p-2 space-y-0.5">
                                {checklist.map((item: any, i: number) => (
                                    <motion.div
                                        key={`task-${i}`}
                                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                                    >
                                        <button
                                            onClick={() => {
                                                const newChecklist = [...checklist];
                                                newChecklist[i] = { ...item, completed: !item.completed };
                                                onAction('update', { checklist: newChecklist });
                                            }}
                                            className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg
                                                hover:bg-[var(--glass-bg)] transition-colors text-left"
                                        >
                                            {item.completed ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                            ) : (
                                                <Circle className="w-4 h-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                                            )}
                                            <span className={cn(
                                                "text-sm leading-tight",
                                                item.completed ? "text-[var(--text-tertiary)] line-through" : "text-white/80"
                                            )}>
                                                {item.text}
                                            </span>
                                        </button>
                                    </motion.div>
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
                                                <span className="text-sm text-[var(--text-primary)]">{stack.action_habit}</span>
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
                        <LiquidGlassButton
                            onClick={generateSubtasks}
                            disabled={isGenerating}
                            className="w-full"
                            variant="primary"
                        >
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                            ) : (
                                <><Sparkles className="w-4 h-4" /> Generate Action Steps</>
                            )}
                        </LiquidGlassButton>
                    )}
                </div>
            </div>

            {/* Actions — bottom pinned */}
            <div className="shrink-0 border-t border-white/5 bg-[var(--glass-bg)] backdrop-blur-2xl p-4 space-y-2">
                {/* Status actions */}
                {!isAnchor && (
                    <div className="flex gap-2">
                        <LiquidGlassButton
                            onClick={() => onAction('done')}
                            disabled={isDone || isMissed || block.status === 'cancelled'}
                            variant="primary"
                            size="sm"
                            className="flex-1"
                        >
                            <Check className="w-4 h-4" /> Done
                        </LiquidGlassButton>
                        <LiquidGlassButton
                            onClick={() => onAction('skip')}
                            disabled={isDone || isMissed || block.status === 'cancelled'}
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                        >
                            <X className="w-4 h-4" /> Incomplete
                        </LiquidGlassButton>
                    </div>
                )}

                {/* Lock Action */}
                {!isAnchor && (
                    <LiquidGlassButton
                        onClick={() => onAction('update', { is_locked: !block.is_locked })}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                    >
                        {block.is_locked ? <><Lock className="w-3.5 h-3.5" /> Locked (AI won't move)</> : <><Unlock className="w-3.5 h-3.5" /> Unlocked (AI can move)</>}
                    </LiquidGlassButton>
                )}

                {/* Delete */}
                <LiquidGlassButton
                    onClick={() => {
                        if (confirmingDelete) {
                            onAction('delete');
                            setConfirmingDelete(false);
                        } else {
                            setConfirmingDelete(true);
                            // Auto-reset after 3 seconds
                            setTimeout(() => setConfirmingDelete(false), 3000);
                        }
                    }}
                    variant="danger"
                    size="sm"
                    className="w-full"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    {confirmingDelete
                        ? (isAnchor ? 'Confirm — Remove From All Days' : 'Confirm Delete')
                        : (isAnchor ? 'Delete Anchor Permanently' : 'Delete Block')
                    }
                </LiquidGlassButton>

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
