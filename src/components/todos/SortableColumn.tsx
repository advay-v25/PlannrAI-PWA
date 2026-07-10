'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TodoItem } from '@/hooks/use-todos';
import { SortableTodoItem } from './SortableTodoItem';
import { Plus } from 'lucide-react';

interface SortableColumnProps {
    color: 'teal' | 'purple' | 'orange' | 'blue' | 'pink';
    label: string;
    todos: TodoItem[];
    onAddTodo: (color: string) => void;
    onToggle: (id: string, completed: boolean) => void;
    onArchive: (id: string) => void;
    onDelete: (id: string) => void;
    onPin: (id: string) => void;
}

const COLOR_CLASSES = {
    teal: 'border-teal-500/30 bg-teal-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    pink: 'border-pink-500/30 bg-pink-500/5',
};

export function SortableColumn({
    color,
    label,
    todos,
    onAddTodo,
    onToggle,
    onArchive,
    onDelete,
    onPin
}: SortableColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id: color });

    return (
        <div
            ref={setNodeRef}
            className={`flex-1 min-w-0 rounded-lg border-2 p-4 flex flex-col gap-3 transition-all ${
                isOver ? `${COLOR_CLASSES[color]} ring-2 ring-[var(--color-primary)]` : 'border-[var(--glass-border)] bg-[var(--glass-bg)]/30'
            }`}
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--glass-border)]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {label} <span className="text-[var(--text-tertiary)]">({todos.length})</span>
                </h3>
                <button
                    onClick={() => onAddTodo(color)}
                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
                    title="Add item to this column"
                >
                    <Plus size={14} />
                </button>
            </div>

            {/* Items */}
            <SortableContext items={todos.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
                    {todos.length === 0 ? (
                        <div className="text-center py-8 text-[var(--text-tertiary)] text-xs">
                            No items yet
                        </div>
                    ) : (
                        todos.map(todo => (
                            <SortableTodoItem
                                key={todo.id}
                                todo={todo}
                                color={color}
                                onToggle={onToggle}
                                onArchive={onArchive}
                                onDelete={onDelete}
                                onPin={onPin}
                            />
                        ))
                    )}
                </div>
            </SortableContext>
        </div>
    );
}
