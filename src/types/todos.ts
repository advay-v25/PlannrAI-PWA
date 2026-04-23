export interface TodoList {
    id: string;
    user_id: string;
    title: string;
    color: string | null;
    created_at: string;
    updated_at: string;
}

export interface Todo {
    id: string;
    user_id: string;
    list_id: string;
    title: string;
    is_completed: boolean;
    assigned_block_id: string | null;
    created_at: string;
    updated_at: string;
}
