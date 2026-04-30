import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

export interface TodoItem {
    id: string;
    title: string;
    is_completed: boolean;
    assigned_block_id?: string | null;
    due_date?: string | null;
    priority?: 'low' | 'medium' | 'high';
}

export interface TodoList {
    id: string;
    title: string;
    color: string | null;
    todos: TodoItem[];
}

export function useTodos() {
    const [lists, setLists] = useState<TodoList[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadLists = useCallback(async () => {
        try {
            const data = await apiClient.get<TodoList[]>('/api/todos');
            if (data) {
                setLists(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("Failed to load todos:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadLists();
    }, [loadLists]);

    const addList = async (title: string) => {
        const data = await apiClient.post<any>('/api/todos', { action: 'create_list', title });
        if (data && data.list) {
            setLists(prev => [...prev, { ...data.list, todos: [] }]);
            window.dispatchEvent(new CustomEvent('calendar-refresh'));
        }
    };

    const deleteList = async (listId: string) => {
        setLists(prev => prev.filter(l => l.id !== listId));
        await apiClient.post('/api/todos', { action: 'delete_list', listId });
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    const addTodo = async (listId: string, title: string, dueDate?: string, priority?: string) => {
        const data = await apiClient.post<any>('/api/todos', { 
            action: 'create_todo', 
            listId, 
            title,
            dueDate,
            priority
        });
        if (data && data.todo) {
            setLists(prev => prev.map(l => {
                if (l.id === listId) {
                    return { ...l, todos: [...l.todos, data.todo] };
                }
                return l;
            }));
            window.dispatchEvent(new CustomEvent('calendar-refresh'));
        }
    };

    const toggleTodo = async (todoId: string, isCompleted: boolean) => {
        setLists(prev => prev.map(l => ({
            ...l,
            todos: l.todos.map(t => t.id === todoId ? { ...t, is_completed: isCompleted } : t)
        })));
        await apiClient.post('/api/todos', { action: 'toggle_todo', todoId, isCompleted });
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    const deleteTodo = async (todoId: string) => {
        setLists(prev => prev.map(l => ({
            ...l,
            todos: l.todos.filter(t => t.id !== todoId)
        })));
        await apiClient.post('/api/todos', { action: 'delete_todo', todoId });
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    const dumpThoughts = async (text: string) => {
        await apiClient.post('/api/todos/dump', { text });
        await loadLists(); // refresh entirely to snag the ai-created ones
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    return {
        lists,
        isLoading,
        addList,
        deleteList,
        addTodo,
        toggleTodo,
        deleteTodo,
        dumpThoughts
    };
}
