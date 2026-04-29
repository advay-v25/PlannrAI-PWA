'use client';

import { useState } from 'react';
import { useTodos } from '@/hooks/use-todos';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Brain, CheckCircle2, Circle, Trash2, Send, ListPlus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '../ui/toast';

export function ActionCenter() {
    const { lists, isLoading, addList, deleteList, addTodo, toggleTodo, deleteTodo } = useTodos();
    const { showToast } = useToast();
    
    const [newListTitle, setNewListTitle] = useState('');
    const [isAddingList, setIsAddingList] = useState(false);
    const [activeListId, setActiveListId] = useState<string | null>(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');

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
        await addTodo(listId, newTaskTitle);
        setNewTaskTitle('');
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
                                    <button 
                                        onClick={() => toggleTodo(todo.id, !todo.is_completed)}
                                        className="shrink-0 pt-0.5 text-white/40 hover:text-orange-400 transition-colors"
                                    >
                                        {todo.is_completed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4" />}
                                    </button>
                                    <span className={cn(
                                        "flex-1 text-[13px] leading-snug transition-all",
                                        todo.is_completed ? "text-white/30 line-through" : "text-white/80"
                                    )}>
                                        {todo.title}
                                    </span>
                                    
                                    <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!todo.is_completed && (
                                            <button 
                                                title="Allocate time with AI"
                                                className="p-1.5 text-white/40 hover:text-orange-400 hover:bg-white/[0.06] rounded-md transition-colors"
                                                onClick={() => {
                                                    // Placeholder for auto-schedule injection
                                                    showToast(`Time allocation pending for: ${todo.title}`, 'info');
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
                                </div>
                            ))}

                            {/* Add Task Quick Row */}
                            {activeListId === list.id ? (
                                <form onSubmit={(e) => handleAddTask(e, list.id)} className="flex items-center px-3 py-1.5 gap-2 border-t border-white/[0.02]">
                                    <input
                                        autoFocus
                                        value={newTaskTitle}
                                        onChange={(e) => setNewTaskTitle(e.target.value)}
                                        onBlur={() => { if(!newTaskTitle) setActiveListId(null); }}
                                        placeholder="Task name..."
                                        className="flex-1 bg-transparent text-[13px] text-white focus:outline-none placeholder:text-white/30"
                                    />
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
