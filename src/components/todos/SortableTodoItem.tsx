'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal, CheckCircle2, Circle, Archive, Trash2, Pin, PinOff } from 'lucide-react';
import { motion } from 'framer-motion';

interface SortableTodoItemProps {
    todo: any;
    color: 'teal' | 'purple' | 'orange' | 'blue' | 'pink';
    onToggle: (id: string, completed: boolean) => void;
    onArchive: (id: string) => void;
    onDelete: (id: string) => void;
    onPin: (id: string) => void;
}

export function SortableTodoItem({
    todo,
    color,
    onToggle,
    onArchive,
    onDelete,
    onPin
}: SortableTodoItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: todo.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const isPinned = todo.description?.includes('[pinned:true]');

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            layout
            className={`todo-item group relative p-4 rounded-lg border transition-all ${
                isDragging
                    ? 'bg-[var(--glass-bg)] border-[var(--color-primary)] shadow-lg'
                    : 'bg-[var(--glass-bg)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)]'
            }`}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Drag to reorder"
            >
                <GripHorizontal size={16} />
            </div>

            {/* Content */}
            <div className="ml-6 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onToggle(todo.id, !todo.is_completed)}
                            className="flex-shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            {todo.is_completed ? (
                                <CheckCircle2 className="w-4 h-4" />
                            ) : (
                                <Circle className="w-4 h-4" />
                            )}
                        </button>

                        <h4 className={`text-sm font-medium ${
                            todo.is_completed ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'
                        }`}>
                            {todo.title}
                        </h4>

                        {isPinned && (
                            <Pin className="w-3.5 h-3.5 text-orange-400" />
                        )}
                    </div>

                    {todo.due_date && (
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-1">
                            Due: {new Date(todo.due_date).toLocaleDateString()}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onPin(todo.id)}
                        className="p-1 text-[var(--text-tertiary)] hover:text-orange-400 transition-colors"
                        title={isPinned ? 'Unpin' : 'Pin'}
                    >
                        {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                        onClick={() => onArchive(todo.id)}
                        className="p-1 text-[var(--text-tertiary)] hover:text-blue-400 transition-colors"
                        title="Archive"
                    >
                        <Archive size={14} />
                    </button>
                    <button
                        onClick={() => onDelete(todo.id)}
                        className="p-1 text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
