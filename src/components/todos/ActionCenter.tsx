'use client';

import { useState } from 'react';
import { useTodos, TodoItem } from '@/hooks/use-todos';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { format, differenceInDays, isPast } from 'date-fns';
import { cn } from '@/lib/utils';

export function ActionCenter() {
    const { todos, isLoading, addTodo, toggleTodo, deleteTodo, reorderTodos } = useTodos();
    
    // Add Task Form State
    const [isAdding, setIsAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');

    // Drag and Drop State
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        await addTodo(title, description || undefined, dueDate || undefined, 'medium');
        setTitle('');
        setDescription('');
        setDueDate('');
        setIsAdding(false);
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        // Required for Firefox
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index.toString());
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
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

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-white/50">
                <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
            </div>
        );
    }

    const completedCount = todos.filter(t => t.is_completed).length;

    return (
        <div className="flex flex-col h-full bg-transparent p-2 sm:p-6 rounded-3xl gap-6 overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Tasks</h2>
                    <p className="text-sm text-white/40 mt-1">{todos.length - completedCount} Active Projects</p>
                </div>
                
                {!isAdding && (
                    <motion.button 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-orange-500/20"
                    >
                        <Plus className="w-4 h-4" /> Add Task
                    </motion.button>
                )}
            </div>

            {/* Add Form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.form 
                        initial={{ opacity: 0, height: 0, y: -20 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -20, overflow: 'hidden' }}
                        onSubmit={handleAddTask}
                        className="bg-[#1c1c1e] border border-orange-500/30 rounded-2xl p-4 flex flex-col gap-3 shadow-xl"
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
                                    onClick={() => { setIsAdding(false); setTitle(''); setDescription(''); }}
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

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start pb-10">
                {todos.map((todo, index) => {
                    const daysLeft = todo.due_date ? differenceInDays(new Date(todo.due_date), new Date()) : null;
                    const createdDate = todo.created_at ? format(new Date(todo.created_at), 'd MMM') : 'Unknown';
                    const isDragging = draggedIndex === index;

                    return (
                        <div
                            key={todo.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragEnd={() => setDraggedIndex(null)}
                            className={cn(
                                "group relative bg-[#1c1c1e] border border-white/5 rounded-[1.5rem] p-5 flex flex-col gap-4 shadow-lg transition-all cursor-grab active:cursor-grabbing",
                                isDragging ? "opacity-30 scale-95" : "hover:border-white/10 hover:-translate-y-1",
                                todo.is_completed && "opacity-50 grayscale"
                            )}
                        >
                            {/* Top Badges */}
                            <div className="flex items-center justify-between">
                                <span className={cn(
                                    "text-[10px] font-bold px-2.5 py-1 rounded-full",
                                    todo.is_completed ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                                )}>
                                    {todo.is_completed ? 'Completed' : `Created - ${createdDate}`}
                                </span>
                                {daysLeft !== null && !todo.is_completed && (
                                    <span className={cn("text-[10px] font-bold", daysLeft < 0 ? "text-red-400" : "text-white/40")}>
                                        {daysLeft < 0 ? "Overdue" : `${daysLeft} days left`}
                                    </span>
                                )}
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
                                {todo.due_date && (
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider",
                                        isPast(new Date(todo.due_date)) && !todo.is_completed ? "text-red-400" : "text-white/30"
                                    )}>
                                        Due {format(new Date(todo.due_date), 'MMM d')}
                                    </span>
                                )}
                            </div>

                            {/* Delete Action */}
                            <button
                                onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
                                className="absolute top-4 right-4 p-1.5 opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 hover:bg-white/5 rounded-lg transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}

                {todos.length === 0 && !isAdding && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-4">
                            <CheckCircle2 className="w-8 h-8 text-white/20" />
                        </div>
                        <h3 className="text-lg font-bold text-white/60">No running projects</h3>
                        <p className="text-sm text-white/30 mt-1">Tap Add Task to start your first project.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
