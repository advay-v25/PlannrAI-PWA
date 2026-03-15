/**
 * 🧠 PLANNRAI — BRAIN DUMP TEMPLATES
 * Quick action templates for common brain dump scenarios.
 */

export interface BrainDumpTemplate {
    id: string;
    trigger: string;
    emoji: string;
    auto_context: {
        emotional_state?: {
            energy: 'depleted' | 'low' | 'medium' | 'high' | 'energized';
            stress: 'calm' | 'moderate' | 'high' | 'overwhelmed';
            sentiment: 'negative' | 'neutral' | 'positive';
        };
        urgency: 'immediate' | 'today' | 'this_week' | 'future';
        primary_category: string;
    };
    pre_prompt: string;
    prompt_user?: string; // If set, ask user for more info before processing
}

export const BRAIN_DUMP_TEMPLATES: Record<string, BrainDumpTemplate> = {
    sick: {
        id: 'sick',
        trigger: "I'm Sick",
        emoji: '🤒',
        auto_context: {
            emotional_state: { energy: 'depleted', stress: 'moderate', sentiment: 'negative' },
            urgency: 'immediate',
            primary_category: 'energy_state',
        },
        pre_prompt: "I'm feeling sick today and need to clear or lighten my schedule. I can't do intensive work.",
    },

    exhausted: {
        id: 'exhausted',
        trigger: 'Exhausted',
        emoji: '😴',
        auto_context: {
            emotional_state: { energy: 'low', stress: 'high', sentiment: 'negative' },
            urgency: 'today',
            primary_category: 'energy_state',
        },
        pre_prompt: "I'm exhausted and need relief from today's schedule. I can't handle intense tasks right now.",
    },

    energized: {
        id: 'energized',
        trigger: 'Energized',
        emoji: '⚡',
        auto_context: {
            emotional_state: { energy: 'energized', stress: 'calm', sentiment: 'positive' },
            urgency: 'today',
            primary_category: 'energy_state',
        },
        pre_prompt: "I'm feeling really energized and productive! I want to make the most of this energy and potentially take on more today.",
    },

    urgent_task: {
        id: 'urgent_task',
        trigger: 'Urgent Task',
        emoji: '📅',
        auto_context: {
            urgency: 'immediate',
            primary_category: 'schedule_disruption',
        },
        pre_prompt: "I have an urgent task that needs to be scheduled immediately.",
        prompt_user: "What's the urgent task and how long will it take?",
    },

    new_idea: {
        id: 'new_idea',
        trigger: 'New Idea',
        emoji: '💡',
        auto_context: {
            urgency: 'future',
            primary_category: 'idea_capture',
        },
        pre_prompt: "I just had a new idea I want to capture and potentially schedule time to explore.",
        prompt_user: "Tell me about your idea!",
    },
};

export function getTemplateById(id: string): BrainDumpTemplate | null {
    return BRAIN_DUMP_TEMPLATES[id] || null;
}

export function getAllTemplates(): BrainDumpTemplate[] {
    return Object.values(BRAIN_DUMP_TEMPLATES);
}
