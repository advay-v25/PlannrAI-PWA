import { runAI } from './run-ai';
import { createClient } from '@/lib/supabase/server';
import { SchedulePatch } from '@/lib/calendar/types';

interface CoachChatContext {
    schedule_blocks: any[];
    active_goals: any[];
    energy_state?: number;
    recent_learnings: string[];
}

interface CoachResponse {
    message: string;
    suggested_action?: {
        type: 'schedule_patch' | 'create_goal' | 'focus_mode';
        data: any;
        patch?: SchedulePatch;
    };
    learning?: {
        insight: string;
        category: string;
        confidence: number;
    };
}

export class CoachAI {
    private userId: string;
    private conversationId: string | null = null;

    constructor(userId: string) {
        this.userId = userId;
    }

    async loadOrCreateConversation(): Promise<string> {
        const supabase = await createClient();
        const { data: active } = await supabase
            .from('coach_conversations')
            .select('id')
            .eq('user_id', this.userId)
            .eq('is_active', true)
            .order('last_message_at', { ascending: false })
            .limit(1)
            .single();

        if (active) {
            this.conversationId = active.id;
            return active.id;
        }

        const { data: newConv, error } = await supabase
            .from('coach_conversations')
            .insert({
                user_id: this.userId,
                is_active: true
            })
            .select()
            .single();

        if (error) throw new Error('Failed to create conversation');
        this.conversationId = newConv.id;
        return newConv.id;
    }

    async sendMessage(message: string): Promise<CoachResponse> {
        if (!this.conversationId) {
            await this.loadOrCreateConversation();
        }

        const supabase = await createClient();

        // Save user message
        await supabase.from('coach_messages').insert({
            conversation_id: this.conversationId,
            role: 'user',
            content: message
        });

        // Gather context
        const context = await this.gatherContext();
        const history = await this.getChatHistory();

        // Build Prompt
        const prompt = this.buildPrompt(message, context);

        // Execute AI
        const response = await runAI({
            channel: 'coach',
            prompt,
            history,
            schema: coachResponseSchema,
            timeout: 15000
        });

        // Save assistant message
        const { data: msg } = await supabase.from('coach_messages').insert({
            conversation_id: this.conversationId,
            role: 'assistant',
            content: response.message,
            action_proposed: response.suggested_action,
            action_status: response.suggested_action ? 'pending' : null
        }).select().single();

        // Extract learning if present
        if (response.learning && response.learning.confidence > 0.8) {
            await supabase.from('coach_learnings').insert({
                user_id: this.userId,
                conversation_id: this.conversationId,
                learning: response.learning.insight,
                category: response.learning.category,
                confidence_score: response.learning.confidence
            });
        }

        // Update conversation
        await supabase.from('coach_conversations').update({
            last_message_at: new Date().toISOString()
        }).eq('id', this.conversationId);

        // Inject message ID to the response action so UI can call apply-action
        if (response.suggested_action) {
            response.suggested_action.data = { ...response.suggested_action.data, message_id: msg?.id };
        }

        return response;
    }

    private async gatherContext(): Promise<CoachChatContext> {
        const supabase = await createClient();
        const today = new Date().toISOString().split('T')[0];

        const [blocks, goals, learnings] = await Promise.all([
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', this.userId)
                .gte('date', today)
                .order('date', { ascending: true })
                .order('start_time', { ascending: true })
                .limit(20),
            supabase.from('goals')
                .select('*')
                .eq('user_id', this.userId)
                .eq('is_active', true),
            supabase.from('coach_learnings')
                .select('learning')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(5)
        ]);

        return {
            schedule_blocks: blocks.data || [],
            active_goals: goals.data || [],
            recent_learnings: (learnings.data || []).map((l: any) => l.learning)
        };
    }

    private async getChatHistory(): Promise<{ role: "user" | "assistant" | "system", content: string }[]> {
        const { data } = await supabase
            .from('coach_messages')
            .select('role, content')
            .eq('conversation_id', this.conversationId)
            .order('created_at', { ascending: true })
            .limit(10);

        return data || [];
    }

    private buildPrompt(userMessage: string, context: CoachChatContext): string {
        return `
SYSTEM: You are Donna, PlannrAI's proactive, high-EQ life coach. 
You are NOT an assistant. You are a strategic partner. Keep responses concise, piercing, and actionable.

USER CONTEXT:
Learnings from past chats: ${context.recent_learnings.join(' | ') || 'None yet'}
Active Goals: ${context.active_goals.map(g => g.title).join(', ')}
Upcoming Schedule: ${JSON.stringify(context.schedule_blocks.map(b => ({ id: b.id, title: b.title, type: b.block_type, start: b.start_time, end: b.end_time })))}

USER MESSAGE: ${userMessage}

Respond in JSON according to the schema. If the user asks to modify their schedule (e.g., "move gym to 5pm", "clear my afternoon"), supply a 'schedule_patch' action with precise block updates.
If the user expresses a deep realization, output a 'learning' to save for long-term memory.
`;
    }
}

const coachResponseSchema = {
    type: 'object',
    properties: {
        message: { type: 'string', description: 'The conversational response from the coach.' },
        suggested_action: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['schedule_patch', 'create_goal', 'focus_mode'] },
                data: { type: 'object' },
                patch: {
                    type: 'object',
                    properties: {
                        update: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    start_time: { type: 'string' },
                                    end_time: { type: 'string' },
                                    date: { type: 'string' }
                                },
                                required: ['id']
                            }
                        },
                        add: { type: 'array', items: { type: 'object' } },
                        remove: { type: 'array', items: { type: 'string' } }
                    }
                }
            },
            required: ['type', 'data']
        },
        learning: {
            type: 'object',
            properties: {
                insight: { type: 'string' },
                category: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['insight', 'category', 'confidence']
        }
    },
    required: ['message']
};
