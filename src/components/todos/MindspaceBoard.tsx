'use client';

import DOMPurify from 'dompurify';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useTodos, TodoItem } from '@/hooks/use-todos';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Trash2, CheckCircle2, Circle, Archive, GripHorizontal, CalendarIcon, AlertCircle, Search, Pin, PinOff, MoreVertical, Edit2, ChevronDown, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, startOfWeek, endOfWeek, isWithinInterval, subDays } from 'date-fns';
import { RichTextEditor } from './RichTextEditor';
import { WeeklyStatsBar } from './WeeklyStatsBar';
import { DndContext, DragOverlay, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors, defaultDropAnimationSideEffects, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

const DEFAULT_LABELS = {
    teal: 'Notes',
    purple: 'Ideas',
    orange: 'Urgent',
    blue: 'Work',
    pink: 'Personal'
};

const COLOR_CLASSES = {
  teal: 'bg-teal-500/10 border-teal-500/20 text-teal-400',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  pink: 'bg-pink-500/10 border-pink-500/20 text-pink-400'
};

const COLOR_DOT_CLASSES = {
  teal: 'bg-teal-400 text-teal-400',
  purple: 'bg-purple-400 text-purple-400',
  orange: 'bg-orange-400 text-orange-400',
  blue: 'bg-blue-400 text-blue-400',
  pink: 'bg-pink-400 text-pink-400'
};

function useColorLabels() {
    const [labels, setLabels] = useState(DEFAULT_LABELS);
    
    useEffect(() => {
        let parsed = null;
        const stored = localStorage.getItem('plannrai_mindspace_labels');
        const oldStored = localStorage.getItem('plannrai_color_labels');

        if (stored) {
            try { parsed = JSON.parse(stored); } catch (e) {}
        } else if (oldStored) {
            try { parsed = JSON.parse(oldStored); } catch (e) {}
        }

        if (parsed) {
            // Clean up old emojis that might be stuck in local storage
            Object.keys(parsed).forEach(key => {
                if (typeof parsed[key] === 'string') {
                    parsed[key] = parsed[key].replace('📝', '').replace('💡', '').replace('🔥', '').replace('💼', '').replace('🏠', '').trim();
                }
            });
            
            // Fix specific user typo as requested
            if (parsed.teal === 'sdalsd') {
                parsed.teal = 'Notes';
                // Update both storages to ensure it's gone
                localStorage.setItem('plannrai_mindspace_labels', JSON.stringify(parsed));
                localStorage.setItem('plannrai_color_labels', JSON.stringify(parsed));
            }
            // Ensure any undefined keys fall back to defaults
            const finalLabels = { ...DEFAULT_LABELS, ...parsed };
            if (parsed.teal === 'sdalsd') finalLabels.teal = 'Notes'; // Double check
            setLabels(finalLabels);
        }
    }, []);

    const updateLabel = (color: keyof typeof DEFAULT_LABELS, newLabel: string) => {
        setLabels(prev => {
            const next = { ...prev, [color]: newLabel };
            localStorage.setItem('plannrai_mindspace_labels', JSON.stringify(next));
            return next;
        });
    };
    return { labels, updateLabel };
}

export function MindspaceBoard() {
    const { todos, isLoading, addTodo, updateTodo, deleteTodo, reorderTodos } = useTodos();
    const { labels, updateLabel } = useColorLabels();
    
    // Quick Add State
    const [isExpanded, setIsExpanded] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedColor, setSelectedColor] = useState<keyof typeof DEFAULT_LABELS>('teal');
    const [searchQuery, setSearchQuery] = useState('');
    const [dueDate, setDueDate] = useState<string>('');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
    
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const plainTextDesc = description.replace(/<[^>]*>?/gm, '').trim();
        if (!title.trim() && !plainTextDesc) return;
        
        const finalDescription = `[color:${selectedColor}] ${description}`;
        await addTodo(
            title || 'Untitled', 
            finalDescription.trim(), 
            dueDate || undefined,
            priority
        );
        setTitle('');
        setDescription('');
        setIsExpanded(false);
        setSelectedColor('teal');
        setDueDate('');
        setPriority('medium');
    };

    const [showArchived, setShowArchived] = useState(false);

    // Parse and group todos
    const activeTodos = useMemo(() => {
        let filtered = todos.filter(t => !t.description?.includes('[archived:true]'));
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(t => 
                t.title.toLowerCase().includes(q) || 
                (t.description || '').toLowerCase().includes(q)
            );
        }
        return filtered.sort((a,b) => (a.order_index || 0) - (b.order_index || 0));
    }, [todos, searchQuery]);

    const archivedTodos = useMemo(() => todos.filter(t => t.description?.includes('[archived:true]')).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || '')), [todos]);

    // Enforce 5 archived limit & auto-clear 7-day old completed items
    const vaultPurgeRun = useRef(false);
    useEffect(() => {
        if (!vaultPurgeRun.current && archivedTodos.length > 0) {
            vaultPurgeRun.current = true;
            const now = new Date();
            const sevenDaysAgo = subDays(now, 7);
            
            // Delete completed vault items older than 7 days
            archivedTodos.forEach(todo => {
                if (todo.is_completed) {
                    const desc = todo.description || '';
                    const archivedAtMatch = desc.match(/\[archived_at:([^\]]+)\]/);
                    const dateStr = archivedAtMatch ? archivedAtMatch[1] : todo.created_at;
                    if (dateStr) {
                        try {
                            const date = new Date(dateStr);
                            if (date < sevenDaysAgo) {
                                deleteTodo(todo.id);
                            }
                        } catch (e) {}
                    }
                }
            });
        }

        // Cap at 5 items
        if (archivedTodos.length > 5) {
            // Delete oldest (since they are sorted newest first, oldest are at the end)
            const toDelete = archivedTodos.slice(5);
            toDelete.forEach(todo => {
                deleteTodo(todo.id);
            });
        }
    }, [archivedTodos, deleteTodo]);

    // dnd-kit Drag and Drop Setup
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
    );

    const [activeId, setActiveId] = useState<string | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) return;

        const activeIdStr = String(active.id);
        const overIdStr = String(over.id);
        if (activeIdStr === overIdStr) return;

        const activeTodo = activeTodos.find(t => t.id === activeIdStr);
        if (!activeTodo) return;

        // Determine target column color
        let targetColor: string | null = null;
        if (Object.keys(DEFAULT_LABELS).includes(overIdStr)) {
            targetColor = overIdStr;
        } else {
            const overTodo = activeTodos.find(t => t.id === overIdStr);
            if (overTodo) {
                const match = (overTodo.description || '').match(/^\[color:(teal|purple|orange|blue|pink)\]\s*/i);
                targetColor = match ? match[1].toLowerCase() : 'teal';
            }
        }

        const rawDesc = activeTodo.description || '';
        const colorMatch = rawDesc.match(/^\[color:(teal|purple|orange|blue|pink)\]\s*/i);
        const currentColor = colorMatch ? colorMatch[1].toLowerCase() : 'teal';

        if (targetColor && currentColor !== targetColor) {
            // Cross-column drop
            let newDesc = rawDesc;
            if (colorMatch) {
                newDesc = rawDesc.replace(/^\[color:(teal|purple|orange|blue|pink)\]\s*/i, `[color:${targetColor}] `);
            } else {
                newDesc = `[color:${targetColor}] ${rawDesc}`;
            }
            updateTodo(activeIdStr, { description: newDesc });
            return;
        }

        // Within-column reorder
        const sortColumn = (columnTodos: TodoItem[]) => {
            return [...columnTodos].sort((a, b) => {
                const aPinned = a.description?.includes('[pinned:true]') ? 1 : 0;
                const bPinned = b.description?.includes('[pinned:true]') ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
        
                const aOrder = a.order_index ?? 0;
                const bOrder = b.order_index ?? 0;
                if (aOrder !== bOrder) return aOrder - bOrder;
        
                if (a.due_date && b.due_date) {
                    const dateCmp = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                    if (dateCmp !== 0) return dateCmp;
                } else if (a.due_date) {
                    return -1;
                } else if (b.due_date) {
                    return 1;
                }
        
                return (b.created_at || '').localeCompare(a.created_at || '');
            });
        };

        const columnTodos = sortColumn(activeTodos.filter(t => {
            const match = (t.description || '').match(/^\[color:(teal|purple|orange|blue|pink)\]\s*/i);
            const c = match ? match[1].toLowerCase() : 'teal';
            return c === currentColor;
        }));

        const oldIndex = columnTodos.findIndex(t => t.id === activeIdStr);
        const newIndex = columnTodos.findIndex(t => t.id === overIdStr);

        if (oldIndex !== -1 && newIndex !== -1) {
            const newColumnOrder = arrayMove(columnTodos, oldIndex, newIndex);
            
            // Reconstruct global todos array to preserve absolute order for other columns
            const newTodos = [...todos];
            const globalIndices = columnTodos.map(ct => todos.findIndex(t => t.id === ct.id)).sort((a, b) => a - b);
            
            newColumnOrder.forEach((item, i) => {
                const globalIndex = globalIndices[i];
                if (globalIndex !== -1) {
                    newTodos[globalIndex] = item;
                }
            });
            
            reorderTodos(newTodos);
        }
    };

    // Columns (sort using the same logic)
    const sortColumnLogic = (a: TodoItem, b: TodoItem) => {
        const aPinned = a.description?.includes('[pinned:true]') ? 1 : 0;
        const bPinned = b.description?.includes('[pinned:true]') ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;

        const aOrder = a.order_index ?? 0;
        const bOrder = b.order_index ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;

        if (a.due_date && b.due_date) {
            const dateCmp = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            if (dateCmp !== 0) return dateCmp;
        } else if (a.due_date) {
            return -1;
        } else if (b.due_date) {
            return 1;
        }

        return (b.created_at || '').localeCompare(a.created_at || '');
    };

    const columns = (Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>).map(color => {
        const columnTodos = activeTodos.filter(t => {
            const match = (t.description || '').match(/^\[color:(teal|purple|orange|blue|pink)\]\s*/i);
            const c = match ? match[1].toLowerCase() : 'teal';
            return c === color;
        });

        return {
            color,
            label: labels[color],
            todos: [...columnTodos].sort(sortColumnLogic)
        };
    });

    // Weekly Stats Logic
    const weeklyStats = useMemo(() => {
        const now = new Date();
        const start = startOfWeek(now, { weekStartsOn: 1 });
        const end = endOfWeek(now, { weekStartsOn: 1 });

        let addedCount = 0;
        let completedCount = 0;

        todos.forEach(todo => {
            // Count Added
            if (todo.created_at) {
                const createdDate = new Date(todo.created_at);
                if (isWithinInterval(createdDate, { start, end })) {
                    addedCount++;
                }
            }

            // Count Completed
            const desc = todo.description || '';
            const completedMatch = desc.match(/\[completed:([^\]]+)\]/);
            if (completedMatch && completedMatch[1]) {
                const completedDate = new Date(completedMatch[1]);
                if (isWithinInterval(completedDate, { start, end })) {
                    completedCount++;
                }
            }
        });

        const total = addedCount + completedCount;
        const addedWidth = total === 0 ? 50 : (addedCount / total) * 100;

        return { addedCount, completedCount, addedWidth };
    }, [todos]);

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-[var(--text-tertiary)] min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full min-w-0 bg-transparent overflow-hidden">

            {/* HERO CAPTURE AREA */}
            <div className="shrink-0 pt-6 px-4 md:pt-10 md:px-8 pb-6 flex flex-col items-center justify-center relative z-20 border-b border-[var(--glass-border)]">
                <div className="max-w-2xl w-full flex flex-col gap-4">
                    <form onSubmit={handleAdd} className="w-full relative">
                        <div className={cn(
                            "bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] rounded-3xl overflow-hidden shadow-lg transition-all duration-300",
                            isExpanded ? "ring-2 ring-[var(--color-primary)]/50 shadow-[0_0_40px_rgba(var(--color-primary-rgb),0.15)]" : "hover:border-[var(--glass-border-hover)]"
                        )}>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                onFocus={() => setIsExpanded(true)}
                                placeholder={isExpanded ? "Title" : "What's on your mind?"}
                                className={cn(
                                    "w-full bg-transparent text-[var(--text-primary)] focus:outline-none placeholder:text-[var(--text-muted)] px-6",
                                    isExpanded ? "py-4 text-xl font-bold" : "py-6 text-2xl font-light text-center"
                                )}
                            />
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-6 pb-2">
                                            <RichTextEditor 
                                                content={description} 
                                                onChange={setDescription} 
                                                placeholder="Dump ideas, notes, or thoughts here..." 
                                            />
                                        </div>
                                        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between p-4 border-t border-[var(--glass-border)] bg-[var(--glass-bg-active)] dark:bg-white/[0.02] gap-4">
                                            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-start sm:items-center w-full sm:w-auto">
                                                <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                                                {(Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>).map(c => (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        title={labels[c]}
                                                        onClick={() => setSelectedColor(c)}
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1",
                                                            selectedColor === c ? COLOR_CLASSES[c] + " ring-1 ring-current" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] bg-[var(--glass-bg)] dark:bg-white/5"
                                                        )}
                                                    >
                                                        {labels[c]}
                                                    </button>
                                                ))}

                                                <div className="w-px h-6 bg-[var(--glass-border)] dark:bg-white/10 mx-2 hidden sm:block" />

                                                {/* Date Picker */}
                                                <div className="relative group/date w-full sm:w-auto">
                                                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none group-focus-within/date:text-[var(--color-primary)] transition-colors z-10" />
                                                    <input
                                                        type="date"
                                                        value={dueDate}
                                                        onChange={(e) => setDueDate(e.target.value)}
                                                        className="pl-8 pr-3 py-1.5 rounded-full bg-[var(--glass-bg)] dark:bg-[#0a0a0c] border border-[var(--glass-border)] dark:border-white/10 text-xs font-semibold text-[var(--text-primary)] dark:text-white/80 hover:border-[var(--glass-border-hover)] dark:hover:border-white/20 focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all outline-none [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 cursor-pointer w-full sm:w-auto"
                                                    />
                                                </div>

                                                {/* Priority Dropdown */}
                                                <div className="relative group/priority w-full sm:w-auto">
                                                    <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none group-focus-within/priority:text-orange-500 dark:group-focus-within/priority:text-orange-400 transition-colors z-10" />
                                                    <select
                                                        value={priority}
                                                        onChange={(e) => setPriority(e.target.value as any)}
                                                        className={cn(
                                                            "pl-8 pr-7 py-1.5 rounded-full border text-xs font-bold transition-all outline-none appearance-none cursor-pointer w-full sm:w-auto",
                                                            priority === 'high' ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400" :
                                                            priority === 'low' ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400" :
                                                            "bg-[var(--glass-bg)] dark:bg-[#0a0a0c] border-[var(--glass-border)] dark:border-white/10 text-[var(--text-primary)] dark:text-white/80 hover:border-[var(--glass-border-hover)] dark:hover:border-white/20"
                                                        )}
                                                    >
                                                        <option value="low" className="bg-[var(--color-bg-secondary)] dark:bg-[#121214]">Low</option>
                                                        <option value="medium" className="bg-[var(--color-bg-secondary)] dark:bg-[#121214]">Medium</option>
                                                        <option value="high" className="bg-[var(--color-bg-secondary)] dark:bg-[#121214]">High</option>
                                                    </select>
                                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] dark:text-white/40 pointer-events-none" />
                                                </div>
                                            </div>
                                            </div>
                                            <div className="flex gap-3 shrink-0 ml-auto w-full sm:w-auto justify-end mt-2 sm:mt-0">
                                                <button
                                                    type="button"
                                                    onClick={() => { setIsExpanded(false); setTitle(''); setDescription(''); setDueDate(''); setPriority('medium'); }}
                                                    className="px-4 py-2 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    type="submit"
                                                    disabled={!title.trim() && !description.replace(/<[^>]*>?/gm, '').trim() && !description.includes('<table>') && !description.includes('<ul>') && !description.includes('<ol>')}
                                                    className="px-6 py-2 bg-[var(--text-primary)] text-[var(--color-bg-primary)] text-xs font-bold rounded-full disabled:opacity-30 hover:opacity-90 transition-all"
                                                >
                                                    Save
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </form>

                    {/* SEARCH BAR & ARCHIVE TOGGLE */}
                    <div className="flex items-center gap-3 w-full">
                        <div className="relative group flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search your notes..."
                                className="w-full bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] focus:border-[var(--glass-border-hover)] rounded-full py-3 pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)]"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowArchived(true)}
                            className="flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] transition-all text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                            <Archive className="w-4 h-4" />
                            <span>Vault ({archivedTodos.length}/5)</span>
                        </button>
                    </div>

                    {/* WEEKLY STAT BAR */}
                    <div className="w-full mt-4 flex flex-col gap-1.5 px-2">
                        <WeeklyStatsBar
                            added={weeklyStats.addedCount}
                            completed={weeklyStats.completedCount}
                        />
                    </div>
                </div>
            </div>

            {/* KANBAN BOARD AREA */}
            <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory md:snap-none">
                {activeTodos.length === 0 && !searchQuery ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 pointer-events-none pb-20">
                        <div className="w-20 h-20 rounded-3xl border border-dashed border-[var(--glass-border)] flex items-center justify-center mb-6 bg-[var(--glass-bg)]">
                            <Plus className="w-8 h-8 text-[var(--text-primary)]" />
                        </div>
                        <p className="text-lg font-light tracking-wide text-[var(--text-primary)]">Your mind is clear.</p>
                        <p className="text-sm font-medium tracking-wide mt-2">Capture ideas, notes, tasks and thoughts above.</p>
                    </div>
                ) : (
                    <DndContext 
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="h-full flex w-max gap-4 px-4 md:px-8 pb-8 items-start pt-6">
                            {columns.map(col => (
                                <KanbanColumn 
                                    key={col.color}
                                    color={col.color}
                                    label={col.label}
                                    todos={col.todos}
                                    onUpdateLabel={updateLabel}
                                    updateTodo={updateTodo}
                                    deleteTodo={deleteTodo}
                                />
                            ))}
                        </div>
                        <DragOverlay>
                            {activeId ? (
                                <div className="bg-[var(--glass-bg)] border border-[var(--color-primary)] rounded-2xl p-4 shadow-xl opacity-90">
                                    <h4 className="font-bold text-[var(--text-primary)] text-sm">
                                        {activeTodos.find(t => t.id === activeId)?.title || 'Dragging...'}
                                    </h4>
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </div>

            {/* ARCHIVED VAULT MODAL */}
            <AnimatePresence>
                {showArchived && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowArchived(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 20, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-[var(--color-bg-secondary)] dark:bg-[#1c1c1e] border border-[var(--glass-border)] dark:border-white/10 rounded-3xl w-full max-w-lg flex flex-col shadow-lg dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
                        >
                            <div className="p-6 border-b border-[var(--glass-border)] dark:border-white/5 flex items-center justify-between bg-[var(--glass-bg-active)] dark:bg-black/20">
                                <div>
                                    <h3 className="text-xl font-bold text-[var(--text-primary)] dark:text-white flex items-center gap-2">
                                        <Archive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        Mindspace Vault
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] dark:text-white/40 mt-1">Stored ideas and completed tasks (Max 5)</p>
                                </div>
                                <button onClick={() => setShowArchived(false)} className="p-2 hover:bg-[var(--glass-bg)] dark:hover:bg-white/10 rounded-full text-[var(--text-tertiary)] dark:text-white/50 hover:text-[var(--text-primary)] dark:hover:text-white transition-colors">
                                    <Plus className="w-5 h-5 rotate-45" />
                                </button>
                            </div>
                            <div className="p-6 flex flex-col gap-3 min-h-[200px] max-h-[60vh] overflow-y-auto">
                                {archivedTodos.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center opacity-50 py-8">
                                        <Archive className="w-10 h-10 mb-4 opacity-50" />
                                        <p className="text-sm font-medium text-[var(--text-primary)]">Vault is empty.</p>
                                    </div>
                                ) : (
                                    archivedTodos.map((todo) => (
                                        <div key={todo.id} className="p-4 rounded-xl bg-[var(--glass-bg)] dark:bg-white/5 border border-[var(--glass-border)] dark:border-white/10 flex items-start justify-between gap-4 group hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 transition-colors">
                                            <div>
                                                <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-white opacity-60 line-through">{todo.title || 'Untitled'}</h4>
                                                <div className="text-xs text-[var(--text-secondary)] dark:text-white/40 mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(todo.description?.replace(/\[.*?\]/g, '').trim() || '') }} />
                                                <p className="text-[10px] text-[var(--text-muted)] dark:text-white/30 uppercase tracking-widest mt-3">Archived</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => {
                                                        const newDesc = todo.description?.replace(/\[archived:true\]/g, '').replace(/\[completed:[^\]]+\]/g, '').replace(/\[archived_at:[^\]]+\]/g, '').trim() || '';
                                                        updateTodo(todo.id, { description: newDesc, isCompleted: false });
                                                    }}
                                                    className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                                                    title="Unvault note"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => deleteTodo(todo.id)}
                                                    className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                                                    title="Delete note"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function KanbanColumn({ color, label, todos, onUpdateLabel, updateTodo, deleteTodo }: any) {
    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [editLabel, setEditLabel] = useState(label);

    const { setNodeRef } = useDroppable({ id: color });

    const handleLabelSave = () => {
        setIsEditingLabel(false);
        if (editLabel.trim() !== label) {
            onUpdateLabel(color, editLabel.trim());
        }
    };

    return (
        <div 
            ref={setNodeRef}
            className="flex flex-col gap-4 h-full w-[85vw] shrink-0 snap-center md:w-auto md:flex-1 md:min-w-[200px]"
        >
            {/* Column Header */}
            <div className="flex items-center justify-between px-1">
                <div
                    className="flex items-center px-4 py-2 rounded-full bg-[var(--glass-bg)] dark:bg-[#0a0a0c]/80 border border-[var(--glass-border)] dark:border-white/[0.08] transition-colors w-fit shadow-sm group cursor-pointer hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/[0.04]"
                    onClick={() => setIsEditingLabel(true)}
                >
                    <div className={cn("w-2 h-2 rounded-full mr-3 shadow-[0_0_8px_currentColor]", COLOR_DOT_CLASSES[color as keyof typeof COLOR_DOT_CLASSES])} />
                    {isEditingLabel ? (
                        <input
                            autoFocus
                            value={editLabel}
                            onChange={e => setEditLabel(e.target.value)}
                            onBlur={handleLabelSave}
                            onKeyDown={e => e.key === 'Enter' && handleLabelSave()}
                            onClick={e => e.stopPropagation()}
                            className="bg-transparent border-none outline-none w-24 font-medium text-sm text-[var(--text-primary)] dark:text-white/90"
                        />
                    ) : (
                        <h3 className="font-medium text-sm text-[var(--text-primary)] dark:text-white/90 select-none flex items-center gap-2" title="Click to rename">
                            {label}
                            <Edit2 className="w-3 h-3 text-[var(--text-tertiary)] dark:text-white/0 group-hover:text-[var(--text-secondary)] dark:group-hover:text-white/40 transition-colors" />
                        </h3>
                    )}
                </div>
                <span className="text-xs font-bold text-[var(--text-muted)] dark:text-white/30 px-2">{todos.length}</span>
            </div>

            {/* Column Cards */}
            <SortableContext items={todos.map((t: TodoItem) => String(t.id))} strategy={verticalListSortingStrategy}>
                <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-3 pb-20 scrollbar-hide">
                    {todos.map((todo: any) => (
                        <MindspaceCard 
                            key={todo.id}
                            todo={todo}
                            updateTodo={updateTodo}
                            deleteTodo={deleteTodo}
                        />
                    ))}
                </div>
            </SortableContext>
        </div>
    );
}

function MindspaceCard({ todo, updateTodo, deleteTodo }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: String(todo.id) });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: 'manipulation'
    };

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTitle, setEditTitle] = useState(todo.title || '');
    const [editDesc, setEditDesc] = useState('');
    const [editPriority, setEditPriority] = useState(todo.priority || 'medium');
    const [editDueDate, setEditDueDate] = useState(todo.due_date ? todo.due_date.split('T')[0] : '');
    
    const rawDescription = todo.description || '';
    const isPinned = rawDescription.includes('[pinned:true]');
    const colorMatch = rawDescription.match(/^\[color:(teal|purple|orange|blue|pink)\]\s*/i);
    const displayColor = colorMatch ? colorMatch[1].toLowerCase() as keyof typeof DEFAULT_LABELS : 'teal';
    
    // Clean description for display
    let displayDescription = colorMatch ? rawDescription.substring(colorMatch[0].length).trim() : rawDescription;
    displayDescription = displayDescription.replace(/\[pinned:true\]/g, '')
                                            .replace(/\[completed:[^\]]+\]/g, '')
                                            .replace(/\[archived_at:[^\]]+\]/g, '')
                                            .replace(/\[archived:true\]/g, '')
                                            .trim();

    const togglePin = (e: React.MouseEvent) => {
        e.stopPropagation();
        let newDesc = rawDescription;
        if (isPinned) {
            newDesc = newDesc.replace(/\[pinned:true\]/g, '').trim();
        } else {
            newDesc = newDesc + ' [pinned:true]';
        }
        updateTodo(todo.id, { description: newDesc });
    };

    const openModal = () => {
        setEditTitle(todo.title || '');
        setEditDesc(displayDescription);
        setEditPriority(todo.priority || 'medium');
        setEditDueDate(todo.due_date ? new Date(todo.due_date).toISOString().split('T')[0] : '');
        setIsModalOpen(true);
    };

    const saveEdit = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        let finalDesc = `[color:${displayColor}] ${editDesc}`;
        if (isPinned) finalDesc += ' [pinned:true]';
        
        let formattedDate = null;
        if (editDueDate) {
            try {
                formattedDate = new Date(editDueDate).toISOString();
            } catch (e) {}
        }

        updateTodo(todo.id, { 
            title: editTitle.trim() || 'Untitled',
            description: finalDesc,
            priority: editPriority,
            due_date: formattedDate
        });
        setIsModalOpen(false);
    };

    const timeAgo = todo.created_at ? formatDistanceToNow(new Date(todo.created_at), { addSuffix: true }) : 'Just now';

    return (
        <>
            {/* The small card on the board */}
            <div
                ref={setNodeRef}
                onClick={openModal}
                className={cn(
                    "group relative bg-[var(--glass-bg)] dark:bg-[#1c1c1e] hover:bg-[var(--glass-bg-hover)] dark:hover:bg-[#2c2c2e] border border-[var(--glass-border)] dark:border-white/[0.05] rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col gap-2",
                    isDragging ? "opacity-30 scale-95" : "opacity-100",
                    isPinned && "border-[var(--color-primary)]/30 dark:border-white/20 bg-[var(--color-primary)]/10 dark:bg-white/5"
                )}
                style={{
                    ...style,
                    boxShadow: isDragging ? 'none' : 'var(--shadow-sm)'
                }}
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                        {/* DRAG HANDLE */}
                        <div
                            {...attributes}
                            {...listeners}
                            className="mt-0.5 cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] dark:text-white/20 hover:text-[var(--text-secondary)] dark:hover:text-white/60 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GripHorizontal className="w-4 h-4" />
                        </div>
                        <h4 className={cn("font-bold text-[var(--text-primary)] text-sm leading-tight", todo.is_completed && "line-through opacity-40")}>
                            {todo.title || 'Untitled'}
                        </h4>
                    </div>
                    <button
                        onClick={togglePin}
                        className={cn(
                            "p-1.5 rounded-full transition-colors shrink-0 -mt-1 -mr-1",
                            isPinned ? "text-[var(--color-primary)] dark:text-white bg-[var(--color-primary)]/10 dark:bg-white/20" : "text-[var(--text-tertiary)] dark:text-white/20 hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        )}
                    >
                        {isPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <Pin className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {displayDescription && (
                    <div
                        className="text-xs text-[var(--text-secondary)] dark:text-white/60 leading-relaxed [&_p]:m-0 [&_ul]:pl-4 [&_ul]:list-disc line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayDescription) }}
                    />
                )}

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--glass-border)] dark:border-white/[0.05]">
                    <span className="text-[10px] font-medium text-[var(--text-muted)] dark:text-white/30 uppercase tracking-wider">{timeAgo}</span>

                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const todayStr = new Date().toISOString().split('T')[0];
                                const newDesc = (todo.description || '') + ` [archived:true] [completed:${todayStr}] [archived_at:${todayStr}]`;
                                updateTodo(todo.id, { isCompleted: true, description: newDesc.trim() });
                            }}
                            className="p-1.5 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-500/10 rounded-md transition-colors text-[var(--text-tertiary)] dark:text-white/30"
                            title="Mark as done and vault"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
                            className="p-1.5 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors text-[var(--text-tertiary)] dark:text-white/30"
                            title="Delete note"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* The Expanded Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 20, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-[var(--color-bg-secondary)] dark:bg-[#1c1c1e] border border-[var(--glass-border)] dark:border-white/10 rounded-2xl w-full max-w-2xl flex flex-col shadow-lg dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
                            style={{ maxHeight: '85vh' }}
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-4 md:p-6 border-b border-[var(--glass-border)] dark:border-white/5 bg-[var(--glass-bg-active)] dark:bg-black/10">
                                <input
                                    autoFocus
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    className="font-bold text-xl md:text-2xl text-[var(--text-primary)] bg-transparent border-none outline-none flex-1 placeholder:text-[var(--text-muted)]"
                                    placeholder="Note title"
                                />
                                <div className="flex items-center gap-2 shrink-0 ml-4">
                                    <button
                                        onClick={togglePin}
                                        className={cn(
                                            "p-2 rounded-full transition-colors",
                                            isPinned ? "text-[var(--color-primary)] dark:text-white bg-[var(--color-primary)]/10 dark:bg-white/20" : "text-[var(--text-tertiary)] dark:text-white/40 hover:bg-[var(--glass-bg)] dark:hover:bg-white/10"
                                        )}
                                        title={isPinned ? "Unpin" : "Pin"}
                                    >
                                        {isPinned ? <Pin className="w-4 h-4 fill-current" /> : <Pin className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body: Editor */}
                            <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6 bg-[var(--glass-bg-active)] dark:bg-black/20 min-h-0 min-w-0 max-w-full">
                                <RichTextEditor
                                    content={editDesc}
                                    onChange={setEditDesc}
                                    placeholder="Write your note here... Use the toolbar above for formatting, lists, and tables."
                                    minHeight="300px"
                                    maxHeight="45vh"
                                />
                            </div>

                            {/* Modal Footer */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:px-6 md:py-4 border-t border-[var(--glass-border)] dark:border-white/5 bg-[var(--color-bg-secondary)] dark:bg-[#1c1c1e]">
                                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                                    <div className="relative group flex items-center">
                                        <div className="absolute left-3 pointer-events-none text-[var(--text-muted)] dark:text-white/40 group-hover:text-[var(--text-secondary)] dark:group-hover:text-white/60 transition-colors">
                                            <CalendarIcon className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="date"
                                            value={editDueDate}
                                            onChange={e => setEditDueDate(e.target.value)}
                                            className="appearance-none bg-[var(--glass-bg)] dark:bg-[#0a0a0c] border border-[var(--glass-border)] dark:border-white/10 rounded-xl px-4 py-2 pl-9 text-xs font-medium text-[var(--text-primary)] dark:text-white/80 outline-none hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/5 focus:border-[var(--color-primary)] dark:focus:border-white/20 transition-all cursor-pointer min-w-[130px] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0"
                                            title="Due Date"
                                        />
                                    </div>
                                    <div className="relative group flex items-center">
                                        <select
                                            value={editPriority}
                                            onChange={e => setEditPriority(e.target.value)}
                                            className={cn(
                                                "appearance-none bg-[var(--glass-bg)] dark:bg-[#0a0a0c] border border-[var(--glass-border)] dark:border-white/10 rounded-xl px-4 py-2 pr-9 text-xs font-medium outline-none hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/5 focus:border-[var(--color-primary)] dark:focus:border-white/20 transition-all cursor-pointer",
                                                editPriority === 'high' ? 'text-red-600 dark:text-red-400' : editPriority === 'low' ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-primary)] dark:text-white/80'
                                            )}
                                            title="Priority"
                                        >
                                            <option value="low" className="bg-[var(--color-bg-secondary)] dark:bg-[#0a0a0c] text-blue-600 dark:text-blue-400">Low Priority</option>
                                            <option value="medium" className="bg-[var(--color-bg-secondary)] dark:bg-[#0a0a0c] text-[var(--text-primary)] dark:text-white">Medium Priority</option>
                                            <option value="high" className="bg-[var(--color-bg-secondary)] dark:bg-[#0a0a0c] text-red-600 dark:text-red-400">High Priority</option>
                                        </select>
                                        <div className="absolute right-3 pointer-events-none text-[var(--text-muted)] dark:text-white/40 group-hover:text-[var(--text-secondary)] dark:group-hover:text-white/60 transition-colors">
                                            <ChevronDown className="w-4 h-4" />
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
                                        className="p-2 ml-1 md:ml-2 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-[var(--text-tertiary)] dark:text-white/30 rounded-xl transition-all shrink-0 border border-transparent hover:border-red-500/20"
                                        title="Delete Note"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-3 self-end sm:self-auto">
                                    <button
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 text-xs uppercase font-bold text-[var(--text-tertiary)] dark:text-white/50 hover:text-[var(--text-primary)] dark:hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={saveEdit}
                                        className="px-6 py-2 bg-[var(--lg-primary-bg)] dark:bg-white/10 hover:bg-[var(--lg-primary-bg-hover)] dark:hover:bg-white/20 text-[var(--text-primary)] dark:text-white text-xs uppercase font-bold rounded-lg transition-all shadow-[var(--lg-primary-shadow)] dark:shadow-lg border border-[var(--lg-primary-border)] dark:border-white/10"
                                    >
                                        Save Note
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
