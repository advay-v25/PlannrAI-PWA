'use client';

import { useState, useMemo } from 'react';
import { useTodos, TodoItem } from '@/hooks/use-todos';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Trash2, CheckCircle2, Circle, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function ActionCenter() {
    const { todos, isLoading, addTodo, updateTodo, deleteTodo } = useTodos();
    
    // Quick Add State
    const [isExpanded, setIsExpanded] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedColor, setSelectedColor] = useState<'teal' | 'purple' | 'orange' | 'blue' | 'pink'>('teal');
    
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() && !description.trim()) return;
        
        // Save color metadata into the description
        const finalDescription = `[color:${selectedColor}] ${description}`;
        
        await addTodo(title || 'Untitled', finalDescription.trim(), undefined, 'medium');
        setTitle('');
        setDescription('');
        setIsExpanded(false);
        setSelectedColor('teal');
    };

    // Separate active and archived
    const activeTodos = useMemo(() => todos.filter(t => !t.is_completed).reverse(), [todos]);
    const archivedTodos = useMemo(() => todos.filter(t => t.is_completed).reverse(), [todos]);

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-white/50 min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-10 h-full max-w-7xl mx-auto pb-32 w-full">
            {/* Input Area */}
            <div className="max-w-2xl mx-auto w-full relative z-20 mt-4">
                <div className={cn(
                    "bg-black/40 backdrop-blur-2xl border border-white/[0.08] rounded-3xl overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_12px_40px_rgba(0,0,0,0.5)] transition-all duration-300",
                    isExpanded ? "ring-1 ring-teal-500/30 shadow-[0_0_50px_rgba(20,184,166,0.15)]" : "hover:border-white/[0.15]"
                )}>
                    <form onSubmit={handleAdd} className="flex flex-col">
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onFocus={() => setIsExpanded(true)}
                            placeholder={isExpanded ? "Title" : "Take a note..."}
                            className={cn(
                                "w-full bg-transparent text-white focus:outline-none placeholder:text-white/40 px-6",
                                isExpanded ? "py-4 text-xl font-bold" : "py-5"
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
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Add details, ideas, or structure..."
                                        className="w-full bg-transparent text-sm text-white/80 focus:outline-none placeholder:text-white/30 px-6 py-2 min-h-[120px] resize-none"
                                    />
                                    <div className="flex items-center justify-between p-4 border-t border-white/[0.04] bg-white/[0.02]">
                                        <div className="flex gap-2">
                                            {/* Color Picker (5 Colors) */}
                                            <button type="button" onClick={() => setSelectedColor('teal')} className={cn("w-6 h-6 rounded-full transition-all", selectedColor === 'teal' ? "bg-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.6)] ring-2 ring-teal-500/30 ring-offset-2 ring-offset-black" : "bg-teal-500/40 hover:bg-teal-500/60")} />
                                            <button type="button" onClick={() => setSelectedColor('purple')} className={cn("w-6 h-6 rounded-full transition-all", selectedColor === 'purple' ? "bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.6)] ring-2 ring-purple-500/30 ring-offset-2 ring-offset-black" : "bg-purple-500/40 hover:bg-purple-500/60")} />
                                            <button type="button" onClick={() => setSelectedColor('orange')} className={cn("w-6 h-6 rounded-full transition-all", selectedColor === 'orange' ? "bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.6)] ring-2 ring-orange-500/30 ring-offset-2 ring-offset-black" : "bg-orange-500/40 hover:bg-orange-500/60")} />
                                            <button type="button" onClick={() => setSelectedColor('blue')} className={cn("w-6 h-6 rounded-full transition-all", selectedColor === 'blue' ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)] ring-2 ring-blue-500/30 ring-offset-2 ring-offset-black" : "bg-blue-500/40 hover:bg-blue-500/60")} />
                                            <button type="button" onClick={() => setSelectedColor('pink')} className={cn("w-6 h-6 rounded-full transition-all", selectedColor === 'pink' ? "bg-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.6)] ring-2 ring-pink-500/30 ring-offset-2 ring-offset-black" : "bg-pink-500/40 hover:bg-pink-500/60")} />
                                        </div>
                                        <div className="flex gap-3">
                                            <button 
                                                type="button" 
                                                onClick={() => { setIsExpanded(false); setTitle(''); setDescription(''); setSelectedColor('teal'); }}
                                                className="px-4 py-2 text-xs font-bold text-white/40 hover:text-white transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="submit"
                                                disabled={!title.trim() && !description.trim()}
                                                className="px-6 py-2 bg-white text-black text-xs font-bold rounded-full disabled:opacity-30 hover:bg-white/90 transition-all shadow-lg shadow-white/10"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </form>
                </div>
            </div>

            {/* Masonry Layout for Active Notes */}
            {activeTodos.length > 0 ? (
                <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6 w-full">
                    <AnimatePresence mode="popLayout">
                        {activeTodos.map(todo => (
                            <NoteCard 
                                key={todo.id} 
                                todo={todo}
                                onUpdate={updateTodo}
                                onDelete={() => deleteTodo(todo.id)}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 opacity-30 pointer-events-none">
                    <div className="w-16 h-16 rounded-full border border-dashed border-white flex items-center justify-center mb-4">
                        <Plus className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm font-medium tracking-wide">Your canvas is empty.</p>
                </div>
            )}
            
            {/* Archived Section */}
            {archivedTodos.length > 0 && (
                <div className="mt-12 pt-12 border-t border-white/[0.05]">
                    <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-8 px-2 flex items-center gap-2">
                        <Archive className="w-4 h-4" />
                        Archived Notes
                    </h3>
                    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6 w-full opacity-60 hover:opacity-100 transition-all duration-500">
                        <AnimatePresence mode="popLayout">
                            {archivedTodos.map(todo => (
                                <NoteCard 
                                    key={todo.id} 
                                    todo={todo}
                                    onUpdate={updateTodo}
                                    onDelete={() => deleteTodo(todo.id)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}
        </div>
    );
}

function NoteCard({ todo, onUpdate, onDelete }: { todo: TodoItem, onUpdate: any, onDelete: any }) {
    // When marked complete, ask user to Archive or Delete
    const [pendingCompletion, setPendingCompletion] = useState(false);

    // Extract color from description if it exists
    const rawDescription = todo.description || '';
    const colorMatch = rawDescription.match(/^\[color:(teal|purple|orange|blue|pink)\]/i);
    const displayColor = colorMatch ? colorMatch[1].toLowerCase() : 'teal';
    const displayDescription = colorMatch ? rawDescription.substring(colorMatch[0].length).trim() : rawDescription;

    const colorStyles = useMemo(() => {
        switch (displayColor) {
            case 'orange':
                return {
                    border: 'border-orange-500/30 hover:border-orange-500/50',
                    shadow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(249,115,22,0.15)]',
                    icon: 'text-orange-500',
                    bg: 'bg-orange-500/5 hover:bg-orange-500/10',
                    label: 'Orange'
                };
            case 'purple':
                return {
                    border: 'border-purple-500/30 hover:border-purple-500/50',
                    shadow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(168,85,247,0.15)]',
                    icon: 'text-purple-500',
                    bg: 'bg-purple-500/5 hover:bg-purple-500/10',
                    label: 'Purple'
                };
            case 'blue':
                return {
                    border: 'border-blue-500/30 hover:border-blue-500/50',
                    shadow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(59,130,246,0.15)]',
                    icon: 'text-blue-500',
                    bg: 'bg-blue-500/5 hover:bg-blue-500/10',
                    label: 'Blue'
                };
            case 'pink':
                return {
                    border: 'border-pink-500/30 hover:border-pink-500/50',
                    shadow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(236,72,153,0.15)]',
                    icon: 'text-pink-500',
                    bg: 'bg-pink-500/5 hover:bg-pink-500/10',
                    label: 'Pink'
                };
            case 'teal':
            default:
                return {
                    border: 'border-teal-500/30 hover:border-teal-500/50',
                    shadow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(20,184,166,0.15)]',
                    icon: 'text-teal-500',
                    bg: 'bg-teal-500/5 hover:bg-teal-500/10',
                    label: 'Teal'
                };
        }
    }, [displayColor]);

    if (pendingCompletion) {
        return (
            <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn("break-inside-avoid relative backdrop-blur-xl rounded-3xl p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col items-center justify-center gap-4 min-h-[200px]", colorStyles.bg, colorStyles.border)}
            >
                <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                <p className={cn("text-base font-bold text-center relative z-10", colorStyles.icon)}>Note Complete!</p>
                <div className="flex w-full gap-3 mt-2 relative z-10">
                    <button 
                        onClick={() => onDelete()}
                        className="flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                    >
                        <Trash2 className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Delete</span>
                    </button>
                    <button 
                        onClick={() => { onUpdate(todo.id, { isCompleted: true }); setPendingCompletion(false); }}
                        className={cn("flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-colors bg-white/5 hover:bg-white/10 text-white border-white/20")}
                    >
                        <Archive className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Archive</span>
                    </button>
                </div>
                <button 
                    onClick={() => setPendingCompletion(false)}
                    className="text-xs font-bold text-white/40 hover:text-white mt-1 relative z-10 transition-colors"
                >
                    Cancel
                </button>
            </motion.div>
        );
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className={cn(
                "break-inside-avoid group relative bg-zinc-900/60 backdrop-blur-xl rounded-3xl p-6 transition-all duration-500 overflow-hidden border",
                todo.is_completed ? "border-white/[0.05] hover:border-white/10" : colorStyles.border,
                !todo.is_completed && colorStyles.shadow,
                "hover:bg-zinc-800/80"
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            
            <div className="relative z-10 flex flex-col gap-4">
                {/* Header (Check & Delete) */}
                <div className="flex items-start justify-between gap-4">
                    <button 
                        onClick={() => {
                            if (todo.is_completed) {
                                onUpdate(todo.id, { isCompleted: false });
                            } else {
                                setPendingCompletion(true);
                            }
                        }}
                        className={cn("mt-0.5 shrink-0 transition-colors", todo.is_completed ? colorStyles.icon : "text-white/30 hover:text-white")}
                    >
                        {todo.is_completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                    </button>
                    
                    <div className="flex-1 min-w-0 pt-0.5">
                        <h4 className={cn("text-base font-bold text-white/90 leading-snug break-words", todo.is_completed && "line-through text-white/40")}>
                            {todo.title}
                        </h4>
                    </div>

                    <button 
                        onClick={() => onDelete()}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0 -mt-1 -mr-1"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Body Content */}
                {displayDescription && (
                    <div className="pl-10">
                        <p className={cn(
                            "text-sm text-white/60 whitespace-pre-wrap break-words leading-relaxed",
                            todo.is_completed && "line-through text-white/30"
                        )}>
                            {displayDescription}
                        </p>
                    </div>
                )}
                
                {/* Footer Metadata */}
                {(todo.created_at || todo.due_date) && (
                    <div className="pl-10 flex items-center justify-between mt-2 pt-4 border-t border-white/[0.04]">
                        {todo.created_at && (
                            <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
                                {format(new Date(todo.created_at), 'MMM d')}
                            </span>
                        )}
                        {!todo.is_completed && (
                            <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md", colorStyles.bg, colorStyles.icon)}>
                                {colorStyles.label} Note
                            </span>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
