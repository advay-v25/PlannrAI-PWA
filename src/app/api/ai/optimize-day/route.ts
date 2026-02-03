import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { generateAIResponse } from '@/lib/ai/groq-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const { date, blocks, energyLevel } = body as {
            date: string;
            blocks: any[];
            energyLevel: number
        };

        if (!blocks || blocks.length === 0) {
            return apiError('No blocks to optimize', 400);
        }

        const prompt = `
YOU ARE THE "TETRIS ENGINE": A hyper-efficient schedule optimizer.
Mission: Fix conflicts, gaps, and energy mismatches in the user's day.

CONTEXT:
Date: ${date}
User Energy: ${energyLevel}/5 (1=Exhausted, 5=Peak)

CURRENT BLOCKS (Messy):
${blocks.map(b => `- "${b.context || b.goal?.title || 'Untitled'}" (${b.start_time} - ${b.end_time}) [ID: ${b.id}]`).join('\n')}

RULES:
1. NO OVERLAPS. Resolve them by shifting lower priority tasks or shortening durations.
2. ENERGY MATCHING. If energy is low (<3), move intense focus tasks to later or shorten them.
3. BUFFERS. Leave 5-10 mins between blocks.
4. DO NOT DELETE IDs. You must return the EXACT block IDs so we can update them.
5. You can shift times, but keep the core "order" unless it makes no sense.

RETURN JSON ONLY:
{
  "optimizedBlocks": [
    { "id": "UUID", "start_time": "HH:MM", "end_time": "HH:MM", "reason": "Moved to avoid overlap" }
  ],
  "changesSummary": "Brief explanation of what you fixed (e.g. 'Resolved overlap between Gym and Meeting, added buffer after Deep Work')."
}
`;

        try {
            const response = await generateAIResponse(prompt, 'COACH', context.userId, true); // JSON mode

            // Parse JSON
            let result;
            try {
                result = JSON.parse(response);
            } catch (e) {
                const match = response.match(/\{[\s\S]*\}/);
                if (match) result = JSON.parse(match[0]);
                else throw new Error("Invalid JSON from AI");
            }

            return apiSuccess({
                optimizedBlocks: result.optimizedBlocks,
                summary: result.changesSummary
            });

        } catch (error) {
            console.error('Optimize Day Error:', error);
            return apiError('Failed to optimize schedule', 500);
        }
    },
    { requireAuth: true, rateLimit: 'ai', auditAction: 'ai_optimize_day' }
);
