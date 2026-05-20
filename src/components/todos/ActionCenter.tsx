'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTodos, TodoItem } from '@/hooks/use-todos';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Trash2, CheckCircle2, Circle, Pencil, RotateCcw, ClipboardList } from 'lucide-react';
import { format, differenceInDays, isPast, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { cn } from '@/lib/utils';

// ── Color System ────────────────────────────────────────────────────

const TASK_COLORS = [
    { name: 'None',    value: 'none',    bg: 'transparent' },
    { name: 'Red',     value: 'red',     bg: '#EF4444' },
    { name: 'Blue',    value: 'blue',    bg: '#3B82F6' },
    { name: 'Yellow',  value: 'yellow',  bg: '#EAB308' },
    { name: 'Green',   value: 'green',   bg: '#22C55E' },
    { name: 'Purple',  value: 'purple',  bg: '#A855F7' },
    { name: 'Orange',  value: 'orange',  bg: '#F97316' },
];

const COLOR_STRIPE_MAP: Record<string, string> = {
    red:    '#EF4444',
    blue:   '#3B82F6',
    yellow: '#EAB308',
    green:  '#22C55E',
    purple: '#A855F7',
    orange: '#F97316',
};

function getTaskColor(todoId: string): string {
    if (typeof window === 'undefined') return 'none';
    return localStorage.getItem(`task-color-${todoId}`) || 'none';
}

function setTaskColor(todoId: string, color: string) {
    if (typeof window === 'undefined') return;
    if (color === 'none') {
        localStorage.removeItem(`task-color-${todoId}`);
    } else {
        localStorage.setItem(`task-color-${todoId}`, color);
    }
}

function isEdited(todoId: string): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`task-edited-${todoId}`) === 'true';
}

function markEdited(todoId: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`task-edited-${todoId}`, 'true');
}

// ── Color Picker Sub-Component ──────────────────────────────────────

function ColorPickerBar({ selected, onSelect }: { selected: string; onSelect: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider mr-1">Colour</span>
            {TASK_COLORS.map(c => (
                <button
                    key={c.value}
                    type="button"
                    onClick={() => onSelect(c.value)}
                    title={c.name}
                    className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center",
                        selected === c.value
                            ? "scale-110 ring-2 ring-white/40 ring-offset-1 ring-offset-[#1c1c1e]"
                            : "hover:scale-105",
                        c.value === 'none' ? 'border-white/20 bg-white/5' : ''
                    )}
                    style={c.value !== 'none' ? { backgroundColor: c.bg, borderColor: c.bg } : {}}
                >
                    {c.value === 'none' && selected === 'none' && (
                        <span className="w-2 h-2 rounded-full bg-white/40" />
                    )}
                </button>
            ))}
        </div>
    );
}

// ── Progress Ring ───────────────────────────────────────────────────

function ProgressRing({ completed, total, size = 48 }: { completed: number; total: number; size?: number }) {
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = total === 0 ? 0 : completed / total;
    const offset = circumference - progress * circumference;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={strokeWidth}
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="url(#progressGradient)"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
            />
            <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#EF4444" />
                </linearGradient>
            </defs>
        </svg>
    );
}

// ── Main Component ──────────────────────────────────────────────────

export function ActionCenter() {
    const { todos, isLoading, addTodo, updateTodo, toggleTodo, deleteTodo, reorderTodos } = useTodos();
    
    // Add Task Form State
    const [isAdding, setIsAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [selectedColor, setSelectedColor] = useState('none');

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [editColor, setEditColor] = useState('none');
    const [editSnapshot, setEditSnapshot] = useState<{ title: string; description: string; dueDate: string; color: string } | null>(null);

    // Force re-render when colors are loaded from localStorage
    const [colorRevision, setColorRevision] = useState(0);
    useEffect(() => { setColorRevision(r => r + 1); }, [todos]);

    // Drag and Drop State
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    // ── Weekly Counter ──────────────────────────────────────────────

    const weekStats = useMemo(() => {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

        const dueThisWeek = todos.filter(t =>
            t.due_date && isWithinInterval(new Date(t.due_date), { start: weekStart, end: weekEnd })
        );
        const completedThisWeek = dueThisWeek.filter(t => t.is_completed);

        return {
            weekLabel: `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM')}`,
            dueCount: dueThisWeek.length,
            completedCount: completedThisWeek.length,
        };
    }, [todos]);

    // ── Handlers ────────────────────────────────────────────────────

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        await addTodo(title, description || undefined, dueDate || undefined, 'medium');
        (window as any).__pendingTaskColor = selectedColor;
        setTitle('');
        setDescription('');
        setDueDate('');
        setSelectedColor('none');
        setIsAdding(false);
    };

    useEffect(() => {
        const pending = (window as any).__pendingTaskColor;
        if (pending && pending !== 'none' && todos.length > 0) {
            const newest = todos[todos.length - 1];
            if (newest && getTaskColor(newest.id) === 'none') {
                setTaskColor(newest.id, pending);
                setColorRevision(r => r + 1);
            }
            (window as any).__pendingTaskColor = null;
        }
    }, [todos]);

    const startEdit = useCallback((todo: TodoItem) => {
        setEditingId(todo.id);
        setEditTitle(todo.title);
        setEditDescription(todo.description || '');
        setEditDueDate(todo.due_date || '');
        const currentColor = getTaskColor(todo.id);
        setEditColor(currentColor);
        setEditSnapshot({
            title: todo.title,
            description: todo.description || '',
            dueDate: todo.due_date || '',
            color: currentColor,
        });
    }, []);

    const saveEdit = useCallback(async () => {
        if (!editingId || !editTitle.trim()) return;
        await updateTodo(editingId, {
            title: editTitle,
            description: editDescription || undefined,
            dueDate: editDueDate || undefined,
        });
        setTaskColor(editingId, editColor);
        markEdited(editingId);
        setEditingId(null);
        setEditSnapshot(null);
        setColorRevision(r => r + 1);
    }, [editingId, editTitle, editDescription, editDueDate, editColor, updateTodo]);

    const revertEdit = useCallback(() => {
        if (!editSnapshot || !editingId) return;
        setEditTitle(editSnapshot.title);
        setEditDescription(editSnapshot.description);
        setEditDueDate(editSnapshot.dueDate);
        setEditColor(editSnapshot.color);
    }, [editSnapshot, editingId]);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditSnapshot(null);
    }, []);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index.toString());
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) return;
        const newTodos = [...todos];
        const [draggedItem] = newTodos.splice(draggedIndex, 1);
        newTodos.splice(targetIndex, 0, draggedItem);
        reorderTodos(newTodos);
        setDraggedIndex(null);
    };

    // ── Loading ─────────────────────────────────────────────────────

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-white/50">
                <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
            </div>
        );
    }

    const completedCount = todos.filter(t => t.is_completed).length;
    const totalCount = todos.length;

    // ── Render ───────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-transparent p-2 sm:p-6 rounded-3xl gap-5 overflow-y-auto custom-scrollbar relative">
            {/* Header Row */}
            <div className="flex items-start justify-between relative z-10">
                {/* Left: Week counter + progress */}
                <div className="flex items-center gap-4">
                    <div className="relative flex items-center justify-center">
                        <ProgressRing completed={completedCount} total={totalCount} size={52} />
                        <span className="absolute text-xs font-bold text-white">
                            {totalCount === 0 ? '–' : `${completedCount}/${totalCount}`}
                        </span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">This Week</h2>
                        <p className="text-[11px] text-white/35 mt-0.5 font-medium">{weekStats.weekLabel}</p>
                        {weekStats.dueCount > 0 && (
                            <p className="text-[10px] text-orange-400/70 mt-0.5 font-semibold">
                                {weekStats.completedCount}/{weekStats.dueCount} due this week
                            </p>
                        )}
                    </div>
                </div>

                {/* Right: Add button */}
                {!isAdding && (
                    <motion.button 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-orange-500/20"
                    >
                        <Plus className="w-4 h-4" /> Add Task
                    </motion.button>
                )}
            </div>

            {/* Subtle separator */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent relative z-10" />

            {/* Add Form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.form 
                        initial={{ opacity: 0, height: 0, y: -20 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -20, overflow: 'hidden' }}
                        onSubmit={handleAddTask}
                        className="bg-[#1c1c1e] border border-orange-500/30 rounded-2xl p-4 flex flex-col gap-3 shadow-xl relative z-10"
                    >
                        <input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="What needs to be done?"
                            className="bg-transparent text-lg font-bold text-white focus:outline-none placeholder:text-white/20"
                        />
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Add details..."
                            rows={2}
                            className="bg-transparent text-sm text-white/70 focus:outline-none placeholder:text-white/20 resize-none"
                        />

                        <ColorPickerBar selected={selectedColor} onSelect={setSelectedColor} />

                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                            <input 
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg text-xs text-white/60 px-3 py-1.5 focus:outline-none focus:border-orange-400/50 [color-scheme:dark]"
                            />
                            <div className="flex gap-3">
                                <button 
                                    type="button"
                                    onClick={() => { setIsAdding(false); setTitle(''); setDescription(''); setSelectedColor('none'); setDueDate(''); }}
                                    className="text-xs text-white/40 hover:text-white/60 font-bold px-3 py-1.5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={!title.trim()}
                                    className="text-xs font-bold bg-white text-black px-4 py-1.5 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-30 disabled:hover:bg-white"
                                >
                                    Save Task
                                </button>
                            </div>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Task Grid — z-10 so cards sit OVER the canvas pattern */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start pb-10 relative z-10">
                {todos.map((todo, index) => {
                    const daysLeft = todo.due_date ? differenceInDays(new Date(todo.due_date), new Date()) : null;
                    const createdDate = todo.created_at ? format(new Date(todo.created_at), 'd MMM') : 'Unknown';
                    const isDragging = draggedIndex === index;
                    const isOverdue = todo.due_date && isPast(new Date(todo.due_date)) && !todo.is_completed;
                    const edited = isEdited(todo.id);
                    const isCurrentlyEditing = editingId === todo.id;

                    // ── Edit Mode ───────────────────────────────────────

                    if (isCurrentlyEditing) {
                        return (
                            <motion.div
                                key={todo.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-[#1c1c1e] border border-blue-500/30 rounded-2xl p-4 flex flex-col gap-3 shadow-xl shadow-blue-500/5"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Pencil className="w-3.5 h-3.5 text-blue-400" />
                                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Editing Task</span>
                                </div>
                                <input
                                    autoFocus
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Task title"
                                    className="bg-transparent text-lg font-bold text-white focus:outline-none placeholder:text-white/20"
                                />
                                <textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="Add details..."
                                    rows={2}
                                    className="bg-transparent text-sm text-white/70 focus:outline-none placeholder:text-white/20 resize-none"
                                />

                                <ColorPickerBar selected={editColor} onSelect={setEditColor} />

                                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                    <input 
                                        type="date"
                                        value={editDueDate}
                                        onChange={(e) => setEditDueDate(e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg text-xs text-white/60 px-3 py-1.5 focus:outline-none focus:border-blue-400/50 [color-scheme:dark]"
                                    />
                                    <div className="flex gap-2">
                                        <button 
                                            type="button"
                                            onClick={revertEdit}
                                            title="Revert changes"
                                            className="flex items-center gap-1 text-[10px] text-amber-400/70 hover:text-amber-400 font-bold px-2 py-1.5 rounded-lg hover:bg-amber-400/5 transition-colors"
                                        >
                                            <RotateCcw className="w-3 h-3" /> Revert
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={cancelEdit}
                                            className="text-xs text-white/40 hover:text-white/60 font-bold px-3 py-1.5 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={saveEdit}
                                            disabled={!editTitle.trim()}
                                            className="text-xs font-bold bg-blue-500 text-white px-4 py-1.5 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-30"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    }

                    // ── Normal Card ─────────────────────────────────────

                    return (
                        <motion.div
                            key={todo.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.03 }}
                            draggable
                            onDragStart={(e) => handleDragStart(e as any, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragEnd={() => setDraggedIndex(null)}
                            className={cn(
                                "group relative bg-[#1c1c1e] border border-white/5 rounded-[1.5rem] flex flex-col shadow-lg transition-all cursor-grab active:cursor-grabbing overflow-hidden",
                                isDragging ? "opacity-30 scale-95" : "hover:border-white/10 hover:-translate-y-0.5 hover:shadow-xl",
                                todo.is_completed && "opacity-50 grayscale",
                                isOverdue && "border-red-500/20"
                            )}
                        >
                            {/* Color Stripe */}
                            {(() => {
                                const c = getTaskColor(todo.id);
                                const stripe = COLOR_STRIPE_MAP[c];
                                return stripe ? (
                                    <div className="w-full h-1.5 flex-shrink-0" style={{ backgroundColor: stripe }} />
                                ) : null;
                            })()}

                            <div className="p-5 flex flex-col gap-4">
                                {/* Top Row: Badges + Edit */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "text-[10px] font-bold px-2.5 py-1 rounded-full",
                                            todo.is_completed ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                                        )}>
                                            {todo.is_completed ? 'Completed' : `Created - ${createdDate}`}
                                        </span>
                                        {edited && (
                                            <span className="text-[9px] font-medium text-white/25 italic">(edited)</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {!todo.is_completed && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); startEdit(todo); }}
                                                className="p-1 opacity-0 group-hover:opacity-100 text-white/20 hover:text-blue-400 hover:bg-blue-400/5 rounded-md transition-all"
                                                title="Edit task"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                        )}

                                        {daysLeft !== null && !todo.is_completed && (
                                            <span className={cn(
                                                "text-[10px] font-bold",
                                                isOverdue ? "text-red-400" : "text-white/40"
                                            )}>
                                                {isOverdue ? "Overdue" : `${daysLeft} days left`}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex gap-3">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); toggleTodo(todo.id, !todo.is_completed); }}
                                        className="shrink-0 mt-0.5 text-white/20 hover:text-orange-400 transition-colors"
                                    >
                                        {todo.is_completed ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Circle className="w-5 h-5" />}
                                    </button>
                                    <div className="flex flex-col gap-1.5 overflow-hidden">
                                        <h4 className={cn(
                                            "text-base font-bold leading-snug break-words",
                                            todo.is_completed ? "text-white/40 line-through" : "text-white/90"
                                        )}>
                                            {todo.title}
                                        </h4>
                                        {todo.description && (
                                            <p className="text-xs text-white/50 leading-relaxed line-clamp-4 break-words">
                                                {todo.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Bottom Row */}
                                <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-1">
                                        <span className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                                            "bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-sm"
                                        )}>
                                            You
                                        </span>
                                    </div>

                                    {/* Delete — center */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
                                        className="p-1.5 opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 hover:bg-white/5 rounded-lg transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>

                                    {todo.due_date && (
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase tracking-wider",
                                            isOverdue ? "text-red-400" : "text-white/30"
                                        )}>
                                            {isOverdue ? 'Overdue' : `Due ${format(new Date(todo.due_date), 'MMM d')}`}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}

                {todos.length === 0 && !isAdding && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-white/5 flex items-center justify-center mb-5">
                            <ClipboardList className="w-9 h-9 text-orange-400/40" />
                        </div>
                        <h3 className="text-lg font-bold text-white/60">No tasks yet</h3>
                        <p className="text-sm text-white/30 mt-1 max-w-[240px]">
                            Tap <span className="text-orange-400 font-semibold">Add Task</span> above to create your first task and start tracking.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
