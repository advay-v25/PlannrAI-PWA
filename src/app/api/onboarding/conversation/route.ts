import { NextResponse } from 'next/server';
import { executeAI } from '@/lib/ai/ai-service';


// Simple text-to-stream helper for V1 demo UI integration
function textToStream(text: string) {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text));
            controller.close();
        },
    });
}

export async function POST(req: Request) {
    try {
        const { messages, step, userName, timezone } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid messages array' }, { status: 400 });
        }

        const latestMessage = messages[messages.length - 1].content;
        const chatHistory = messages.slice(0, -1).map((m: any) => `${m.role}: ${m.content}`);

        let responseText = "";

        if (step === 'snapshot') {
            const aiResponse = await executeAI('onboarding_user', {
                channel: 'onboarding_life_snapshot',
                input: latestMessage,
                context: {
                    chatHistory,
                    user: { name: userName },
                    timezone
                }
            });

            // If Donna is highly confident, we output the raw JSON so the client can parse it and proceed.
            // Otherwise, we output Donna's conversational reply asking for clarification.
            if (aiResponse.confidence >= 0.8 && aiResponse.missing && aiResponse.missing.length === 0) {
                // Signal to the frontend that extraction is complete.
                responseText = `EXTRACTION_COMPLETE\n\n\`\`\`json\n${JSON.stringify(aiResponse, null, 2)}\n\`\`\``;
            } else {
                responseText = aiResponse.next_question || "Could you tell me a bit more about your schedule?";
            }
        }
        else if (step === 'goals') {
            const aiResponse = await executeAI('onboarding_user', {
                channel: 'onboarding_goal_discovery',
                input: latestMessage,
                context: {
                    chatHistory,
                    user: { name: userName }
                }
            });

            // If goals are identified and no clarification is needed, return the payload
            if (aiResponse.identified_goals && Object.keys(aiResponse.identified_goals).length > 0 && !aiResponse.clarification_needed) {
                responseText = `EXTRACTION_COMPLETE\n\n\`\`\`json\n${JSON.stringify(aiResponse, null, 2)}\n\`\`\``;
            } else {
                responseText = aiResponse.response_to_user || "Tell me more about what you want to achieve.";
            }
        }
        else {
            return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
        }

        // Return a mock stream response so useChat handles it naturally
        return new Response(textToStream(responseText), {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8'
            }
        });

    } catch (error) {
        console.error('Onboarding Conversation Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process conversation' },
            { status: 500 }
        );
    }
}
