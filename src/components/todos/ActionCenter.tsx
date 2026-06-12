'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTodos, TodoItem } from '@/hooks/use-todos';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Trash2, CheckCircle2, Circle, Archive, GripHorizontal, Tag, CalendarIcon, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { RichTextEditor } from './RichTextEditor';

const DEFAULT_LABELS = {
    teal: 'Notes',
    purple: 'Ideas',
    orange: 'Urgent',
    blue: 'Work',
    pink: 'Personal'
};

const COLOR_CLASSES = {
  teal: 'bg-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.6)] ring-teal-500/30',
  purple: 'bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.6)] ring-purple-500/30',
  orange: 'bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.6)] ring-orange-500/30',
  blue: 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)] ring-blue-500/30',
  pink: 'bg-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.6)] ring-pink-500/30'
};

function useColorLabels() {
    const [labels, setLabels] = useState(DEFAULT_LABELS);
    
    useEffect(() => {
        const stored = localStorage.getItem('plannrai_color_labels');
        if (stored) {
            try { setLabels(JSON.parse(stored)); } catch (e) {}
        }
    }, []);

    const updateLabel = (color: keyof typeof DEFAULT_LABELS, newLabel: string) => {
        setLabels(prev => {
            const next = { ...prev, [color]: newLabel };
            localStorage.setItem('plannrai_color_labels', JSON.stringify(next));
            return next;
        });
    };
    return { labels, updateLabel };
}

export function ActionCenter() {
    const { todos, isLoading, addTodo, updateTodo, deleteTodo, reorderTodos } = useTodos();
    const { labels, updateLabel } = useColorLabels();
    
    // Quick Add State
    const [isExpanded, setIsExpanded] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedColor, setSelectedColor] = useState<keyof typeof DEFAULT_LABELS>('teal');
    const [dueDate, setDueDate] = useState<string>('');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
    
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        // Allow adding if there's either a title OR description
        const plainTextDesc = description.replace(/<[^>]*>?/gm, '').trim();
        if (!title.trim() && !plainTextDesc) return;
        
        const finalDescription = `[color:${selectedColor}] ${description}`;
        await addTodo(
            title || 'Untitled', 
            finalDescription.trim(), 
            dueDate ? new Date(dueDate).toISOString() : undefined, 
            priority
        );
        setTitle('');
        setDescription('');
        setDueDate('');
        setPriority('medium');
        setIsExpanded(false);
        setSelectedColor('teal');
    };

    // Separate active and archived. Ensure active respects order_index
    const activeTodos = useMemo(() => todos.filter(t => !t.is_completed).sort((a,b) => (a.order_index || 0) - (b.order_index || 0)), [todos]);
    const archivedTodos = useMemo(() => todos.filter(t => t.is_completed).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || '')), [todos]);

    // HTML5 Drag and Drop Setup
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index.toString());
            // Create a transparent drag image to allow custom styling
            const crt = e.currentTarget.cloneNode(true) as HTMLElement;
            crt.style.backgroundColor = "rgba(0,0,0,0.5)";
            crt.style.position = "absolute"; crt.style.top = "-1000px"; crt.style.right = "-1000px";
            document.body.appendChild(crt);
            e.dataTransfer.setDragImage(crt, 0, 0);
            setTimeout(() => document.body.removeChild(crt), 0);
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

        const newActiveTodos = [...activeTodos];
        const [draggedItem] = newActiveTodos.splice(draggedIndex, 1);
        newActiveTodos.splice(targetIndex, 0, draggedItem);
        
        const fullNewList = [...newActiveTodos, ...archivedTodos];
        reorderTodos(fullNewList);
        setDraggedIndex(null);
    };

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-white/50 min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 h-full max-w-7xl mx-auto pb-32 w-full">
            
            {/* Color Legend / Configurator */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 w-full">
                {(Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>).map(color => (
                    <div key={color} className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/[0.05] rounded-full px-3 py-1.5 shadow-lg">
                        <div className={cn("w-3 h-3 rounded-full", COLOR_CLASSES[color as keyof typeof DEFAULT_LABELS].split(' ')[0])} />
                        <input
                            type="text"
                            value={labels[color as keyof typeof DEFAULT_LABELS]}
                            onChange={(e) => updateLabel(color as keyof typeof DEFAULT_LABELS, e.target.value)}
                            placeholder="Tag Name"
                            className="bg-transparent text-xs font-bold text-white/60 focus:text-white outline-none w-16 focus:w-24 transition-all"
                        />
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <div className="max-w-3xl mx-auto w-full relative z-20">
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
                                    <div className="px-6 pb-2">
                                        <RichTextEditor 
                                            content={description} 
                                            onChange={setDescription} 
                                            placeholder="Add details, ideas, or structure..." 
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between p-4 border-t border-white/[0.04] bg-white/[0.02] gap-4">
                                        <div className="flex flex-wrap items-center gap-4">
                                            {/* Colors */}
                                            <div className="flex gap-2">
                                                {(Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>).map(color => (
                                                    <button 
                                                        key={color}
                                                        type="button" 
                                                        title={labels[color]}
                                                        onClick={() => setSelectedColor(color)} 
                                                        className={cn(
                                                            "w-6 h-6 rounded-full transition-all ring-2 ring-offset-2 ring-offset-black", 
                                                            selectedColor === color 
                                                                ? COLOR_CLASSES[color]
                                                                : cn(COLOR_CLASSES[color].split(' ')[0], "opacity-40 hover:opacity-80 ring-transparent")
                                                        )} 
                                                    />
                                                ))}
                                            </div>
                                            
                                            {/* Due Date & Priority */}
                                            <div className="flex gap-3 border-l border-white/10 pl-4">
                                                <div className="flex items-center gap-1.5 text-white/50 hover:text-white cursor-pointer transition-colors group/date relative">
                                                    <CalendarIcon className="w-4 h-4" />
                                                    <span className="text-[11px] font-bold uppercase tracking-widest">
                                                        {dueDate ? format(new Date(dueDate), 'MMM d') : 'Date'}
                                                    </span>
                                                    <input 
                                                        type="date"
                                                        value={dueDate}
                                                        onChange={(e) => setDueDate(e.target.value)}
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors relative">
                                                    <AlertCircle className="w-4 h-4" />
                                                    <select
                                                        value={priority}
                                                        onChange={e => setPriority(e.target.value as any)}
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                    >
                                                        <option value="low">Low</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="high">High</option>
                                                    </select>
                                                    <span className="text-[11px] font-bold uppercase tracking-widest">
                                                        {priority}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 ml-auto">
                                            <button 
                                                type="button" 
                                                onClick={() => { setIsExpanded(false); setTitle(''); setDescription(''); setSelectedColor('teal'); setDueDate(''); setPriority('medium'); }}
                                                className="px-4 py-2 text-xs font-bold text-white/40 hover:text-white transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="submit"
                                                disabled={!title.trim() && !description.replace(/<[^>]*>?/gm, '').trim()}
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

            {/* Active Notes Grid */}
            {activeTodos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start w-full">
                    {activeTodos.map((todo, index) => (
                        <div
                            key={todo.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragEnd={() => setDraggedIndex(null)}
                            className={cn(
                                "transition-all duration-300",
                                draggedIndex === index ? "opacity-30 scale-95" : "opacity-100"
                            )}
                        >
                            <NoteCardBase 
                                todo={todo}
                                onUpdate={updateTodo}
                                onDelete={() => deleteTodo(todo.id)}
                                labels={labels}
                            />
                        </div>
                    ))}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start w-full opacity-60 hover:opacity-100 transition-all duration-500">
                        {archivedTodos.map(todo => (
                            <NoteCardBase 
                                key={todo.id} 
                                todo={todo}
                                onUpdate={updateTodo}
                                onDelete={() => deleteTodo(todo.id)}
                                labels={labels}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Base UI Component (Inline Editable)
function NoteCardBase({ todo, onUpdate, onDelete, labels }: any) {
    const [pendingCompletion, setPendingCompletion] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    
    // Inline edit state
    const [editTitle, setEditTitle] = useState(todo.title || '');
    
    const rawDescription = todo.description || '';
    const colorMatch = rawDescription.match(/^\[color:(teal|purple|orange|blue|pink)\]\s*/i);
    const displayColor = colorMatch ? colorMatch[1].toLowerCase() as keyof typeof DEFAULT_LABELS : 'teal';
    const displayDescription = colorMatch ? rawDescription.substring(colorMatch[0].length).trim() : rawDescription;
    
    const [editDesc, setEditDesc] = useState(displayDescription);

    const handleTitleBlur = () => {
        if (editTitle.trim() !== todo.title) onUpdate(todo.id, { title: editTitle.trim() });
    };
    
    // We only trigger update on blur of the rich text editor container or when clicking a save button.
    // For simplicity, we can just save it when they click outside, but rich text might blur on toolbar click.
    // Let's add a Save button when editing or just trust blur if we don't click the toolbar.
    const saveDescription = () => {
        if (editDesc.trim() !== displayDescription) {
            onUpdate(todo.id, { description: `[color:${displayColor}] ${editDesc.trim()}` });
        }
        setIsEditing(false);
    };

    const handleColorChange = (newColor: string) => {
        onUpdate(todo.id, { description: `[color:${newColor}] ${displayDescription}` });
    };

    const colorStyles = useMemo(() => {
        switch (displayColor) {
            case 'orange': return { border: 'border-orange-500/30', shadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(249,115,22,0.15)]', icon: 'text-orange-500', bg: 'bg-orange-500/5 hover:bg-orange-500/10' };
            case 'purple': return { border: 'border-purple-500/30', shadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(168,85,247,0.15)]', icon: 'text-purple-500', bg: 'bg-purple-500/5 hover:bg-purple-500/10' };
            case 'blue': return { border: 'border-blue-500/30', shadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(59,130,246,0.15)]', icon: 'text-blue-500', bg: 'bg-blue-500/5 hover:bg-blue-500/10' };
            case 'pink': return { border: 'border-pink-500/30', shadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(236,72,153,0.15)]', icon: 'text-pink-500', bg: 'bg-pink-500/5 hover:bg-pink-500/10' };
            case 'teal': default: return { border: 'border-teal-500/30', shadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(20,184,166,0.15)]', icon: 'text-teal-500', bg: 'bg-teal-500/5 hover:bg-teal-500/10' };
        }
    }, [displayColor]);

    if (pendingCompletion) {
        return (
            <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn("relative backdrop-blur-xl rounded-3xl p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col items-center justify-center gap-4 min-h-[200px]", colorStyles.bg, colorStyles.border)}
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
                        className="flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-colors bg-white/5 hover:bg-white/10 text-white border-white/20"
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
        <div
            className={cn(
                "group relative bg-zinc-900/60 backdrop-blur-xl rounded-3xl p-6 transition-all duration-300 overflow-visible border flex flex-col gap-4 cursor-default",
                todo.is_completed ? "border-white/[0.05]" : colorStyles.border,
                !todo.is_completed && "hover:-translate-y-1 hover:shadow-2xl",
                !todo.is_completed && colorStyles.shadow,
                "hover:bg-zinc-800/80"
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none rounded-3xl" />
            
            <div className="relative z-10 flex flex-col gap-3">
                {/* Header (Check, Drag Handle, Delete) */}
                <div className="flex items-start gap-3">
                    <button 
                        onClick={() => {
                            if (todo.is_completed) onUpdate(todo.id, { isCompleted: false });
                            else setPendingCompletion(true);
                        }}
                        className={cn("mt-1 shrink-0 transition-colors", todo.is_completed ? colorStyles.icon : "text-white/30 hover:text-white")}
                    >
                        {todo.is_completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                        <input 
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onBlur={handleTitleBlur}
                            className={cn(
                                "w-full bg-transparent border-b border-transparent focus:border-white/20 text-base font-bold text-white/90 leading-snug outline-none transition-colors px-1 -ml-1", 
                                todo.is_completed && "line-through text-white/40"
                            )}
                            placeholder="Empty Title"
                        />
                    </div>

                    {!todo.is_completed && (
                        <div className="opacity-0 group-hover:opacity-100 p-1.5 text-white/30 hover:text-white cursor-grab active:cursor-grabbing rounded-lg transition-all shrink-0">
                            <GripHorizontal className="w-4 h-4" />
                        </div>
                    )}
                    
                    <button 
                        onClick={() => onDelete()}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0 -mt-1 -mr-1"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Body Content */}
                <div className="pl-8">
                    {!todo.is_completed ? (
                        isEditing ? (
                            <div className="flex flex-col gap-2">
                                <RichTextEditor 
                                    content={editDesc} 
                                    onChange={setEditDesc} 
                                    placeholder="Empty note..." 
                                    minHeight="80px"
                                />
                                <div className="flex justify-end gap-2">
                                    <button 
                                        onClick={() => { setEditDesc(displayDescription); setIsEditing(false); }}
                                        className="text-[10px] uppercase font-bold text-white/40 hover:text-white px-2 py-1"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={saveDescription}
                                        className="text-[10px] uppercase font-bold bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div 
                                onClick={() => setIsEditing(true)}
                                className={cn(
                                    "w-full bg-transparent border border-transparent hover:border-white/10 text-sm text-white/80 rounded px-2 -ml-2 py-1 transition-colors cursor-text min-h-[40px] prose prose-sm prose-invert",
                                )}
                                dangerouslySetInnerHTML={{ __html: displayDescription || '<span class="text-white/30 italic">Empty note...</span>' }}
                            />
                        )
                    ) : (
                        <div 
                            className="w-full text-sm text-white/30 line-through prose prose-sm prose-invert opacity-50 px-2 -ml-2 py-1"
                            dangerouslySetInnerHTML={{ __html: displayDescription || 'Empty note...' }}
                        />
                    )}
                </div>
                
                {/* Footer Metadata & Inline Editing */}
                <div className="pl-8 flex items-center justify-between mt-2 pt-3 border-t border-white/[0.04] flex-wrap gap-2">
                    
                    {/* Inline Color Picker */}
                    {!todo.is_completed ? (
                        <div className="flex gap-1">
                            {(Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>).map(color => (
                                <button 
                                    key={color}
                                    onClick={() => handleColorChange(color)}
                                    title={labels[color as keyof typeof DEFAULT_LABELS]}
                                    className={cn(
                                        "w-4 h-4 rounded-full transition-all",
                                        displayColor === color 
                                            ? COLOR_CLASSES[color as keyof typeof DEFAULT_LABELS].split(' ')[0] + " ring-1 ring-white/50" 
                                            : COLOR_CLASSES[color as keyof typeof DEFAULT_LABELS].split(' ')[0] + " opacity-20 hover:opacity-100"
                                    )}
                                />
                            ))}
                        </div>
                    ) : (
                        <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Archived</span>
                    )}

                    {/* Inline Due Date & Priority */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-white/30 hover:text-white/60 cursor-pointer transition-colors group/date relative">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <select
                                value={todo.priority || 'medium'}
                                onChange={e => onUpdate(todo.id, { priority: e.target.value })}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-1.5 text-white/30 hover:text-white/60 cursor-pointer transition-colors group/date relative">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                                {todo.due_date ? format(new Date(todo.due_date), 'MMM d') : 'No Date'}
                            </span>
                            <input 
                                type="date"
                                value={todo.due_date ? todo.due_date.split('T')[0] : ''}
                                onChange={(e) => onUpdate(todo.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
