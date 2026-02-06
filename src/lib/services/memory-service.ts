
import { createClient } from '@/lib/supabase/server';
import { PostgrestSingleResponse } from '@supabase/supabase-js';

// Types (should eventually move to database.types.ts)
export interface Conversation {
    id: string;
    user_id: string;
    type: 'coach' | 'brain_dump';
    title?: string;
    created_at: string;
    updated_at: string;
}

export interface ConversationMessage {
    id: string;
    conversation_id: string;
    user_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata: Record<string, any>;
    created_at: string;
}

export class MemoryService {

    /**
     * Creates or retrieves a conversation for a specific context.
     * For 'coach', we might want one continuous thread or daily threads.
     * Let's support creating new ones for now.
     */
    static async createConversation(
        userId: string,
        type: 'coach' | 'brain_dump',
        title?: string
    ): Promise<Conversation | null> {
        const supabase = await createClient();

        try {
            const { data, error } = await supabase
                .from('conversations')
                .insert({
                    user_id: userId,
                    type,
                    title
                })
                .select()
                .single();

            if (error) throw error;
            return data as Conversation;
        } catch (e) {
            console.error('MemoryService.createConversation failed', e);
            return null;
        }
    }

    /**
     * Adds a message to history.
     */
    static async addMessage(
        userId: string,
        conversationId: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        metadata: Record<string, any> = {}
    ): Promise<ConversationMessage | null> {
        const supabase = await createClient();

        try {
            const { data, error } = await supabase
                .from('conversation_messages')
                .insert({
                    user_id: userId,
                    conversation_id: conversationId,
                    role,
                    content,
                    metadata
                })
                .select()
                .single();

            if (error) throw error;

            // Touch updated_at on conversation
            await supabase
                .from('conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId);

            return data as ConversationMessage;
        } catch (e) {
            console.error('MemoryService.addMessage failed', e);
            return null;
        }
    }

    /**
     * Gets the recent history for a conversation.
     */
    static async getHistory(conversationId: string, limit = 30): Promise<ConversationMessage[]> {
        const supabase = await createClient();

        const { data } = await supabase
            .from('conversation_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }) // Oldest first for LLM context
            .limit(limit);

        return (data || []) as ConversationMessage[];
    }

    /**
     * Gets the most recent conversation of a type.
     */
    static async getLatestConversation(userId: string, type: 'coach' | 'brain_dump'): Promise<Conversation | null> {
        const supabase = await createClient();

        const { data } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userId)
            .eq('type', type)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        return (data as Conversation) || null;
    }
}
