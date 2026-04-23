import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

export interface TodoItem {
    id: string;
    title: string;
    is_completed: boolean;
    assigned_block_id?: string | null;
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
        const { data } = await apiClient.post<any>('/api/todos', { action: 'create_list', title });
        if (data) {
            setLists(prev => [...prev, { ...data, todos: [] }]);
        }
    };

    const deleteList = async (listId: string) => {
        setLists(prev => prev.filter(l => l.id !== listId));
        await apiClient.post('/api/todos', { action: 'delete_list', listId });
    };

    const addTodo = async (listId: string, title: string) => {
        const { data } = await apiClient.post<any>('/api/todos', { action: 'create_todo', listId, title });
        if (data) {
            setLists(prev => prev.map(l => {
                if (l.id === listId) {
                    return { ...l, todos: [...l.todos, data] };
                }
                return l;
            }));
        }
    };

    const toggleTodo = async (todoId: string, isCompleted: boolean) => {
        setLists(prev => prev.map(l => ({
            ...l,
            todos: l.todos.map(t => t.id === todoId ? { ...t, is_completed: isCompleted } : t)
        })));
        await apiClient.post('/api/todos', { action: 'toggle_todo', todoId, isCompleted });
    };

    const deleteTodo = async (todoId: string) => {
        setLists(prev => prev.map(l => ({
            ...l,
            todos: l.todos.filter(t => t.id !== todoId)
        })));
        await apiClient.post('/api/todos', { action: 'delete_todo', todoId });
    };

    const dumpThoughts = async (text: string) => {
        await apiClient.post('/api/todos/dump', { text });
        await loadLists(); // refresh entirely to snag the ai-created ones
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
