'use client';

import { useState } from 'react';
import { useTodos } from '@/hooks/use-todos';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Circle, Trash2, ListPlus, Sparkles, Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { useToast } from '../ui/toast';
import { format, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils';

export function ActionCenter() {
    const { lists, isLoading, addList, deleteList, addTodo, toggleTodo, deleteTodo } = useTodos();
    const { showToast } = useToast();
    
    const [newListTitle, setNewListTitle] = useState('');
    const [isAddingList, setIsAddingList] = useState(false);
    const [activeListId, setActiveListId] = useState<string | null>(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [newTaskDueDate, setNewTaskDueDate] = useState('');
    const [confirmingTodoId, setConfirmingTodoId] = useState<string | null>(null);

    const handleAddList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newListTitle.trim()) return;
        await addList(newListTitle);
        setNewListTitle('');
        setIsAddingList(false);
    };

    const handleAddTask = async (e: React.FormEvent, listId: string) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;
        await addTodo(listId, newTaskTitle, newTaskDueDate || undefined, newTaskPriority);
        setNewTaskTitle('');
        setNewTaskPriority('medium');
        setNewTaskDueDate('');
        setActiveListId(null);
    };

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-white/50">
                <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950/40 p-4 gap-4 overflow-y-auto no-scrollbar">
            
            {/* Lists Header */}
            <div className="flex items-center justify-between pt-2">
                <h3 className="text-sm font-bold text-white/80">Your Lists</h3>
                <button 
                    onClick={() => setIsAddingList(!isAddingList)}
                    className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors"
                >
                    <ListPlus className="w-4 h-4" />
                </button>
            </div>

            {/* New List Input */}
            <AnimatePresence>
                {isAddingList && (
                    <motion.form 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleAddList}
                        className="flex gap-2 overflow-hidden"
                    >
                        <input 
                            value={newListTitle}
                            onChange={(e) => setNewListTitle(e.target.value)}
                            placeholder="List name..."
                            autoFocus
                            className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                        />
                        <button type="submit" disabled={!newListTitle.trim()} className="px-3 bg-zinc-800 text-white rounded-lg text-sm disabled:opacity-50">
                            Add
                        </button>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Lists Display */}
            <div className="flex flex-col gap-3 pb-8">
                {lists.map(list => (
                    <div key={list.id} className="bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden flex flex-col">
                        
                        <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border-b border-white/[0.04]">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: list.color || '#f97316' }} />
                                <span className="text-sm font-semibold text-white/90">{list.title}</span>
                                <span className="text-xs text-white/40 ml-1">{list.todos.filter(t => !t.is_completed).length} items</span>
                            </div>
                            <button 
                                onClick={() => deleteList(list.id)}
                                className="text-white/20 hover:text-red-400 p-1 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <div className="flex flex-col">
                            {list.todos.map(todo => (
                                <div key={todo.id} className="flex items-center justify-between group px-3 py-2 hover:bg-white/[0.02] transition-colors gap-2 border-b border-white/[0.02] last:border-0">
                                    {/* Confirm-complete flow: shows confirmation inline */}
                                    {confirmingTodoId === todo.id ? (
                                        <div className="flex items-center gap-2 w-full">
                                            <span className="text-[13px] text-amber-400 flex-1">Confirm completed?</span>
                                            <button 
                                                onClick={async () => {
                                                    await deleteTodo(todo.id);
                                                    setConfirmingTodoId(null);
                                                    showToast('Task completed! ✓', 'success');
                                                }}
                                                className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                                            >
                                                Yes
                                            </button>
                                            <button 
                                                onClick={() => setConfirmingTodoId(null)}
                                                className="px-2 py-0.5 text-xs bg-white/[0.06] text-white/50 rounded hover:bg-white/10 transition-colors"
                                            >
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => setConfirmingTodoId(todo.id)}
                                                className="shrink-0 pt-0.5 text-white/40 hover:text-orange-400 transition-colors"
                                            >
                                                <Circle className="w-4 h-4" />
                                            </button>
                                            <div className="flex-1 flex flex-col min-w-0">
                                                <span className="text-[13px] leading-snug text-white/80 truncate">
                                                    {todo.title}
                                                </span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {todo.priority && todo.priority !== 'medium' && (
                                                        <span className={cn(
                                                            "text-[9px] uppercase font-bold tracking-wider px-1 rounded",
                                                            todo.priority === 'high' ? "text-red-400 bg-red-400/10" : "text-blue-400 bg-blue-400/10"
                                                        )}>
                                                            {todo.priority}
                                                        </span>
                                                    )}
                                                    {todo.due_date && (
                                                        <div className={cn(
                                                            "flex items-center gap-1 text-[9px] font-medium",
                                                            isPast(new Date(todo.due_date)) && !isToday(new Date(todo.due_date)) ? "text-red-400" : "text-white/40"
                                                        )}>
                                                            <CalendarIcon className="w-2.5 h-2.5" />
                                                            {format(new Date(todo.due_date), 'MMM d')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {!todo.is_completed && (
                                                    <button 
                                                        title="Schedule with AI"
                                                        className="p-1.5 text-white/40 hover:text-orange-400 hover:bg-white/[0.06] rounded-md transition-colors"
                                                        onClick={async () => {
                                                            showToast(`🤖 Asking Donna to schedule: "${todo.title}"...`, 'ai');
                                                            try {
                                                                const { apiClient } = await import('@/lib/api-client');
                                                                await apiClient.post('/api/coach', {
                                                                    message: `Please find time in my schedule today for this task: "${todo.title}". Create a block for it.`,
                                                                    source: 'task_schedule'
                                                                });
                                                                showToast(`✅ Donna is scheduling "${todo.title}". Check the Coach panel.`, 'success');
                                                            } catch {
                                                                showToast('Failed to schedule task.', 'error');
                                                            }
                                                        }}
                                                    >
                                                        <Sparkles className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => deleteTodo(todo.id)}
                                                    className="p-1.5 text-white/20 hover:text-red-400 hover:bg-white/[0.06] rounded-md transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}

                            {/* Add Task Quick Row */}
                            {activeListId === list.id ? (
                                <form onSubmit={(e) => handleAddTask(e, list.id)} className="flex flex-col border-t border-white/[0.02] bg-white/[0.01]">
                                    <div className="flex items-center px-3 py-2 gap-2">
                                        <input
                                            autoFocus
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            placeholder="Task name..."
                                            className="flex-1 bg-transparent text-[13px] text-white focus:outline-none placeholder:text-white/30"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between px-3 pb-2 gap-2">
                                        <div className="flex items-center gap-2">
                                            <select 
                                                value={newTaskPriority}
                                                onChange={(e) => setNewTaskPriority(e.target.value as any)}
                                                className="bg-white/[0.06] border border-white/[0.1] rounded text-[10px] text-white/60 px-1.5 py-0.5 focus:outline-none focus:border-orange-400/50"
                                            >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                            </select>
                                            <input 
                                                type="date"
                                                value={newTaskDueDate}
                                                onChange={(e) => setNewTaskDueDate(e.target.value)}
                                                className="bg-white/[0.06] border border-white/[0.1] rounded text-[10px] text-white/60 px-1.5 py-0.5 focus:outline-none focus:border-orange-400/50 [color-scheme:dark]"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                type="button"
                                                onClick={() => { setActiveListId(null); setNewTaskTitle(''); }}
                                                className="text-[10px] text-white/30 hover:text-white/60"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="submit"
                                                disabled={!newTaskTitle.trim()}
                                                className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded hover:bg-orange-500/30 transition-colors disabled:opacity-30"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <button
                                    onClick={() => setActiveListId(list.id)}
                                    className="flex items-center gap-2 px-3 py-2 text-[12px] text-white/30 hover:text-white/60 transition-colors w-full text-left"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add task...
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
}
