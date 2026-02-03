import { createClient } from '@/lib/supabase/server';
import { generateAIResponse, SYSTEM_PROMPTS } from '@/lib/ai/groq-client';
import { UserContext } from '@/types/database';
import { SupabaseClient } from '@supabase/supabase-js';

export class MemoryManager {
    /**
     * EXTRACT: Analyze text (chat/dump) and find permanent facts/patterns.
     */
    static async extractMemories(
        text: string,
        source: string, // 'brain_dump' | 'coach_chat'
        userId: string,
        client?: SupabaseClient
    ): Promise<void> {
        const prompt = `
ANALYZE TRAFFIC:
User Text: "${text}"

MISSION: Extract PERMANENT context about the user.
Ignore transient info (e.g. "I'm hungry now").
Capture permanent info (e.g. "I'm vegan", "I hate early meetings", "My goal is a marathon").

OUTPUT JSON ONLY:
{
  "memories": [
    { "type": "fact", "content": "User lives in Seattle" },
    { "type": "preference", "content": "User prefers concise feedback" },
    { "type": "constraint", "content": "User has kids and cannot work past 5pm" }
  ]
}
If nothing permanent found, return { "memories": [] }.
`;

        try {
            // We use a lighter model or the same model for extraction
            const aiResponse = await generateAIResponse(prompt, 'MEMORY_EXTRACTOR' as any, userId, true);
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                if (data.memories && Array.isArray(data.memories)) {
                    await this.saveMemories(data.memories, source, userId, client);
                }
            }
        } catch (err) {
            console.error('Memory extraction failed:', err);
        }
    }

    /**
     * SAVE: Persist memories to the database.
     * Future: Add semantic deduplication.
     */
    static async saveMemories(
        memories: Array<{ type: string; content: string }>,
        source: string,
        userId: string,
        client?: SupabaseClient
    ) {
        const supabase = client ?? await createClient();

        const validMemories = memories.filter(m =>
            ['fact', 'preference', 'pattern', 'constraint'].includes(m.type) && m.content.length > 5
        );

        if (validMemories.length === 0) return;

        // Naive insert for now (no semantic dedup yet)
        const { error } = await supabase.from('user_context').insert(
            validMemories.map(m => ({
                user_id: userId,
                type: m.type,
                content: m.content,
                source: source,
                confidence: 1.0
            }))
        );

        if (error) {
            console.error('Failed to save memories:', error);
        } else {
            console.log(`Saved ${validMemories.length} new memories.`);
        }
    }

    /**
     * RETRIEVE: Get relevant context for a situation.
     * Currently fetches ALL high-confidence context.
     * Future: Vector search based on query.
     */
    static async retrieveContext(userId: string, client?: SupabaseClient): Promise<string> {
        const supabase = client ?? await createClient();

        const { data: memories } = await supabase
            .from('user_context')
            .select('type, content')
            .eq('user_id', userId)
            .limit(20); // Token limit protection

        if (!memories || memories.length === 0) return '';

        // Group by type for readable injection
        const grouped = memories.reduce((acc, mem) => {
            if (!acc[mem.type]) acc[mem.type] = [];
            acc[mem.type].push(mem.content);
            return acc;
        }, {} as Record<string, string[]>);

        let contextStr = "User Operational Manual (KNOWN FACTS):\n";
        if (grouped.fact) contextStr += `- Facts: ${grouped.fact.join('; ')}\n`;
        if (grouped.preference) contextStr += `- Preferences: ${grouped.preference.join('; ')}\n`;
        if (grouped.constraint) contextStr += `- Constraints: ${grouped.constraint.join('; ')}\n`;
        if (grouped.pattern) contextStr += `- Patterns: ${grouped.pattern.join('; ')}\n`;

        return contextStr;
    }
}
