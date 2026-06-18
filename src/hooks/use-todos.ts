import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

export interface TodoItem {
    id: string;
    title: string;
    description?: string | null;
    is_completed: boolean;
    assigned_block_id?: string | null;
    due_date?: string | null;
    priority?: 'low' | 'medium' | 'high';
    created_at?: string;
    order_index?: number;
}

export function useTodos() {
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadTodos = useCallback(async () => {
        try {
            const data = await apiClient.get<TodoItem[]>('/api/todos');
            if (data) {
                setTodos(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("Failed to load todos:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTodos();
    }, [loadTodos]);

    const addTodo = async (title: string, description?: string, dueDate?: string, priority?: 'low' | 'medium' | 'high') => {
        const orderIndex = todos.length > 0 ? Math.max(...todos.map(t => t.order_index || 0)) + 1 : 0;
        const data = await apiClient.post<any>('/api/todos', { 
            action: 'create_todo', 
            title,
            description,
            dueDate,
            priority,
            orderIndex
        });
        // apiClient unwraps the ApiEnvelope, so `data` is the raw todo row directly
        if (data && data.id) {
            setTodos(prev => [...prev, data]);
            window.dispatchEvent(new CustomEvent('calendar-refresh'));

            // Cross-feature: Suggest blocking time for high-priority today-due todos
            if (data.calendar_suggestion && data.calendar_suggestion_message) {
                toast(data.calendar_suggestion_message, {
                    action: {
                        label: 'Block Time',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('schedule-recompute', {
                                detail: { trigger: 'todo_block_time', todoId: data.id, todoTitle: title }
                            }));
                        },
                    },
                    duration: 8000,
                });
            }
        }
    };

    const toggleTodo = async (todoId: string, isCompleted: boolean) => {
        setTodos(prev => prev.map(t => t.id === todoId ? { ...t, is_completed: isCompleted } : t));
        const result = await apiClient.post<any>('/api/todos', { action: 'toggle_todo', todoId, isCompleted });
        window.dispatchEvent(new CustomEvent('calendar-refresh'));

        // Cross-feature: If calendar block was synced, dispatch recompute
        if (result?.calendar_synced) {
            window.dispatchEvent(new CustomEvent('schedule-recompute', {
                detail: { trigger: 'todo_completed', todoId }
            }));
        }
    };

    const updateTodo = async (todoId: string, updates: { title?: string, description?: string, dueDate?: string, priority?: 'low' | 'medium' | 'high', isCompleted?: boolean }) => {
        setTodos(prev => prev.map(t => {
            if (t.id === todoId) {
                return {
                    ...t,
                    title: updates.title !== undefined ? updates.title : t.title,
                    description: updates.description !== undefined ? updates.description : t.description,
                    due_date: updates.dueDate !== undefined ? updates.dueDate : t.due_date,
                    priority: updates.priority !== undefined ? updates.priority : t.priority,
                    is_completed: updates.isCompleted !== undefined ? updates.isCompleted : t.is_completed
                };
            }
            return t;
        }));
        await apiClient.post('/api/todos', { action: 'update_todo', todoId, ...updates });
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    const deleteTodo = async (todoId: string) => {
        setTodos(prev => prev.filter(t => t.id !== todoId));
        await apiClient.post('/api/todos', { action: 'delete_todo', todoId });
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    const reorderTodos = async (reorderedTodos: TodoItem[]) => {
        setTodos(reorderedTodos);
        const updates = reorderedTodos.map((t, index) => ({ id: t.id, order_index: index }));
        await apiClient.post('/api/todos', { action: 'reorder_todos', updates });
    };

    return {
        todos,
        isLoading,
        addTodo,
        toggleTodo,
        updateTodo,
        deleteTodo,
        reorderTodos
    };
}
