
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { apiClient } from '@/lib/api-client';

// -- Schema Types (matching 20260210210000_phase4_memory.sql) --

export interface CoachThread {
    id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

export interface CoachMessage {
    id: string;
    thread_id: string;
    user_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string; // JSON string for assistant, text for user
    created_at: string;
}

export interface BrainDumpEntry {
    id: string;
    user_id: string;
    raw_text: string;
    extracted_json: any;
    created_at: string;
}

export interface MemoryFact {
    id: string;
    user_id: string;
    key: string;
    value: any;
    confidence: number;
    kind?: 'preference' | 'pattern' | 'constraint' | 'identity';
    source_event_id?: string;
    updated_at: string;
}

export class MemoryService {

    // --- Coach Context ---

    /**
     * Creates a new Coach Thread.
     */
    static async createThread(userId: string, title: string = 'New Session'): Promise<CoachThread | null> {
        const supabase = await createClient();
        try {
            const { data, error } = await supabase
                .from('coach_threads')
                .insert({ user_id: userId, title })
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[MemoryService] createThread failed', e);
            return null;
        }
    }

    /**
     * Adds a message to a Coach Thread.
     * Optionally triggers async fact extraction.
     */
    static async addCoachMessage(
        userId: string,
        threadId: string,
        role: 'user' | 'assistant' | 'system',
        content: string, // Text or JSON string
        triggerExtraction: boolean = false
    ): Promise<CoachMessage | null> {
        const supabase = await createClient();
        try {
            const { data, error } = await supabase
                .from('coach_messages')
                .insert({
                    thread_id: threadId,
                    user_id: userId,
                    role,
                    content
                })
                .select()
                .single();

            if (error) throw error;

            // Update thread timestamp
            await supabase.from('coach_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);

            if (triggerExtraction && role === 'user') {
                // Fire and forget fact extraction
                this.extractFacts(userId, content, data.id).catch(err =>
                    console.error('[MemoryService] Background extraction failed', err)
                );
            }

            return data;
        } catch (e) {
            console.error('[MemoryService] addCoachMessage failed', e);
            return null;
        }
    }

    // --- Brain Dump Context ---

    /**
     * Stores a raw Brain Dump.
     */
    static async createBrainDumpEntry(
        userId: string,
        rawText: string,
        extractedJson: any = {}
    ): Promise<BrainDumpEntry | null> {
        const supabase = await createClient();
        try {
            const { data, error } = await supabase
                .from('brain_dump_entries')
                .insert({
                    user_id: userId,
                    raw_text: rawText,
                    extracted_json: extractedJson
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[MemoryService] createBrainDumpEntry failed', e);
            return null;
        }
    }

    // --- Long-Term Memory (Facts) ---

    /**
     * Extracts facts from text using AI (Mock logic for now, or lightweight heuristic).
     * In a real system, this calls a dedicated "Analyst" LLM pass.
     */
    static async extractFacts(userId: string, text: string, sourceId?: string) {
        // TODO: Implement actual LLM call to extract facts.
        // For now, checks for simple patterns to demonstrate persistence.

        const lower = text.toLowerCase();
        const factsToStore: Partial<MemoryFact>[] = [];

        if (lower.includes('i prefer')) {
            factsToStore.push({ key: 'preference', value: text, kind: 'preference', confidence: 0.7 });
        }
        if (lower.includes('never schedule')) {
            factsToStore.push({ key: 'constraint', value: text, kind: 'constraint', confidence: 0.9 });
        }
        if (lower.includes('my goal is')) {
            factsToStore.push({ key: 'goal_hint', value: text, kind: 'identity', confidence: 0.6 });
        }

        if (factsToStore.length > 0) {
            const supabase = await createClient();
            for (const fact of factsToStore) {
                await supabase.from('memory_facts').insert({
                    user_id: userId,
                    key: fact.key!,
                    value: fact.value,
                    confidence: fact.confidence,
                    kind: fact.kind,
                    source_event_id: sourceId
                });
            }
        }
    }

    /**
     * Retrieves relevant facts for context injection.
     */
    static async getRelevantFacts(userId: string, limit = 5): Promise<MemoryFact[]> {
        const supabase = await createClient();
        const { data } = await supabase
            .from('memory_facts')
            .select('*')
            .eq('user_id', userId)
            .order('confidence', { ascending: false })
            .limit(limit);
        return data || [];
    }
}
