import { classifyIntent, CoachIntent } from '../intent-classifier';

// Mock the AI client to avoid real API calls during tests
jest.mock('@/lib/ai/unified-client', () => ({
    callAI: jest.fn().mockImplementation(async ({ prompt }) => {
        // Basic mock implementation for the AI fallback path during testing
        // In a real scenario we'd mock specific responses based on the prompt
        if (prompt && prompt.includes("Please clarify this")) {
            return {
                success: true,
                data: {
                    primary_intent: CoachIntent.CLARIFICATION_NEEDED,
                    confidence: 0.4,
                    entities: {},
                    requires_clarification: true,
                    clarification_question: "I'm not sure what you mean. Could you be more specific?"
                }
            };
        }

        if (prompt && prompt.includes("what is the weather")) {
            return {
                success: true,
                data: {
                    primary_intent: CoachIntent.OUT_OF_SCOPE,
                    confidence: 0.9,
                    entities: {},
                    requires_clarification: false
                }
            };
        }

        if (prompt && prompt.includes("move my reading")) {
            return {
                success: true,
                data: {
                    primary_intent: CoachIntent.MOVE_BLOCK,
                    confidence: 0.95,
                    entities: { block_reference: 'reading' },
                    requires_clarification: false
                }
            };
        }

        // Default fallback mock
        return {
            success: true,
            data: {
                primary_intent: CoachIntent.GENERAL_CHAT,
                confidence: 0.8,
                entities: {},
                requires_clarification: false
            }
        };
    })
}));

describe('Intent Classifier', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Quick Pattern Matching', () => {
        test('classifies BUSY_AT_TIME correctly', async () => {
            const result = await classifyIntent(
                "I'm busy at 4pm",
                [],
                { current_time: '14:00', today_blocks: [], goals: [] }
            );

            expect(result.primary_intent).toBe(CoachIntent.BUSY_AT_TIME);
            expect(result.confidence).toBeGreaterThan(0.8);
            expect(result.entities.time).toBe('4pm');
        });

        test('detects OVERWHELMED vs just ENERGY_LOW', async () => {
            const overwhelmed = await classifyIntent("I'm overwhelmed", [], {});
            expect(overwhelmed.primary_intent).toBe(CoachIntent.OVERWHELMED);

            const tired = await classifyIntent("I'm exhausted", [], {});
            expect(tired.primary_intent).toBe(CoachIntent.ENERGY_LOW);
        });

        test('detects WHAT_NEXT correctly', async () => {
            const result = await classifyIntent("What should I do now?", [], {});
            expect(result.primary_intent).toBe(CoachIntent.WHAT_NEXT);
        });

        test('detects UNDO_LAST correctly', async () => {
            const result = await classifyIntent("Undo that", [], {});
            expect(result.primary_intent).toBe(CoachIntent.UNDO_LAST);
        });

        test('detects BORED correctly and instantly', async () => {
            const result = await classifyIntent("I have nothing to do", [], {});
            expect(result.primary_intent).toBe(CoachIntent.BORED);
        });
    });

    describe('AI Classification Fallback/Complex Cases', () => {
        test('handles multi-intent messages', async () => {
            // For this test, our RegEx might not catch multi-intent, so it would fall to AI.
            // We would ideally mock the AI response for this exact string if we want to test AI logic,
            // but let's assume the quick matcher might catch one. Actually, "busy at 4pm and also exhausted"
            // will trigger the busyMatch regex FIRST and return before hitting the exhausted regex.
            // Wait, quick matcher returns early and doesn't handle secondary intent. Let's test the mock.

            const { callAI } = require('@/lib/ai/unified-client');
            callAI.mockResolvedValueOnce({
                success: true,
                data: {
                    primary_intent: CoachIntent.BUSY_AT_TIME,
                    secondary_intent: CoachIntent.ENERGY_LOW,
                    confidence: 0.9,
                    entities: { time: '4pm' },
                    requires_clarification: false
                }
            });

            // Bypassing quick match by using variations that break the simple regex OR
            // we mock the quick match by just sending it straight.
            // Let's send something that won't match regex to force AI call:
            const result = await classifyIntent(
                "My schedule at 16:00 is packed and my mind is foggy",
                [],
                { current_time: '14:00', today_blocks: [], goals: [] }
            );

            expect(result.primary_intent).toBe(CoachIntent.BUSY_AT_TIME);
            expect(result.secondary_intent).toBe(CoachIntent.ENERGY_LOW);
            expect(callAI).toHaveBeenCalledTimes(1);
        });

        test('requires clarification for ambiguous input', async () => {
            const result = await classifyIntent(
                "Please clarify this",
                [],
                { current_time: '14:00', today_blocks: [], goals: [] }
            );

            expect(result.requires_clarification).toBe(true);
            expect(result.clarification_question).toBeTruthy();
        });

        test('detects OUT_OF_SCOPE intents', async () => {
            const result = await classifyIntent("what is the weather", [], {});
            expect(result.primary_intent).toBe(CoachIntent.OUT_OF_SCOPE);
        });

        test('detects MOVE_BLOCK using AI context', async () => {
            const result = await classifyIntent("move my reading to the afternoon instead", [], {});
            expect(result.primary_intent).toBe(CoachIntent.MOVE_BLOCK);
            expect(result.entities?.block_reference).toBe('reading');
        });

        test('detects GENERAL_CHAT fallback', async () => {
            // General chat has no special string triggers in the mock, it hits the default return
            const result = await classifyIntent("this day is really annoying me", [], {});
            expect(result.primary_intent).toBe(CoachIntent.GENERAL_CHAT);
        });

        test('handles completely null context gracefully without throwing', async () => {
            // Reverts to the mock default (General Chat) because userContext is empty and it triggers fallback
            const result = await classifyIntent("what is up?", [], {});
            expect(result.primary_intent).toBe(CoachIntent.GENERAL_CHAT);
        });
    });
});
