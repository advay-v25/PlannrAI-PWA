
import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateCoachMessage } from '@/lib/security/input-validator';
import { generateAIResponse } from '@/lib/ai/groq-client';
import { ContextBuilder } from '@/lib/agents/context-builder';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';
import { MemoryService } from '@/lib/services/memory-service';
import { CoachActionService } from '@/lib/coach/coach-actions';
import { CoachResponse, CalendarPatch } from '@/types/coach-v4';

/**
 * AI COACH V4 API (Chief of Staff)
 * Action-First, Context-Aware, Direct Mutation.
 */
export const POST = secureApiRoute(
    async (context, body) => {
        // 1. Validation
        const validation = validateRequiredFields(body, ['message']);
        if (!validation.valid) return apiError(`Missing field: ${validation.missing.join(', ')}`);

        const { message } = body as { message: string };
        const msgValidation = validateCoachMessage(message);
        if (!msgValidation.valid) return apiError(msgValidation.errors.join(', '));
        const sanitizedMessage = msgValidation.sanitized;

        const supabase = await createClient();

        // 2. Build Context (The "Real" State)
        // using the existing ContextBuilder which fetches Schedule, Anchors, Memory
        const agentContext = await ContextBuilder.build(context.userId, supabase);

        // 3. Construct LLM Input
        // We flatten the context for the LLM to minimize token usage while retaining strictness
        const llmContext = {
            now: agentContext.now.toISOString(),
            timezone: agentContext.timezone,
            scheduleSummary: agentContext.currentSchedule?.map((s: any) => ({
                id: s.id,
                title: s.title,
                start: s.start_time,
                end: s.end_time,
                type: s.block_type || 'block',
                fixed: s.is_fixed || false
            })) || [],
            anchors: agentContext.currentSchedule?.filter((s: any) => s.block_type === 'anchor') || [],
            goals: agentContext.goals?.map(g => g.title) || [],
            recentMemories: agentContext.recentMemories?.map((m: any) => `${m.role}: ${m.content}`).slice(-10) || [],
            userMessage: sanitizedMessage
        };

        const prompt = `
        User Message: "${sanitizedMessage}"
        
        Current Time: ${llmContext.now} (${llmContext.timezone})
        
        Schedule Context (Today/Tomorrow):
        ${JSON.stringify(llmContext.scheduleSummary, null, 2)}
        
        Active Goals: ${llmContext.goals.join(', ')}
        
        Recent Chat History:
        ${JSON.stringify(llmContext.recentMemories)}
        
        INSTRUCTIONS:
        Analyze the request. Determine if it requires ACTION (Calendar Mutation) or just INFO.
        Generate the JSON response strictly adhering to the schema.
        If "executed", YOU must generate the patch. 
        NOTE: For "executed" mode, the backend will apply the patch immediately.
        For "choice" mode, provide options.
        `;

        try {
            // 4. Trace & Call LLM
            const responseJson = await generateAIResponse(
                prompt,
                'COACH_V4',
                context.userId,
                true // Force JSON mode
            );

            // 5. Parse & Validate Response
            let coachResponse: CoachResponse;
            try {
                coachResponse = JSON.parse(responseJson) as CoachResponse;
            } catch (e) {
                console.error("Failed to parse Coach JSON:", responseJson);
                return apiError("Coach brain malfunction (Invalid JSON)", 500);
            }

            // 6. Handle "Executed" Mode (Auto-Apply)
            if (coachResponse.mode === 'executed' && coachResponse.options && coachResponse.options.length > 0) {
                // In V4 "Executed" mode, the LLM provides a single "option" as the executed action
                // OR it might provide a `patch` field at root? 
                // schema says `options?: CoachOption[]`.
                // If executed, we assume the first option is the one to run.
                const actionToRun = coachResponse.options[0];
                if (actionToRun && actionToRun.patch) {
                    console.log(`[Coach V4] Auto-Executing: ${actionToRun.title}`);
                    const undoToken = await CoachActionService.applyPatch(context.userId, actionToRun.patch, supabase);

                    if (undoToken !== 'error_saving_undo') {
                        coachResponse.undo_token = undoToken;
                    }
                    // Clear options for the UI so it just shows "Executed" checkmark?
                    // Or keep them for debug? The UI should see mode='executed' and show the summary + undo button.
                }
            }

            // 7. Save to Memory
            let conversation = await MemoryService.getLatestConversation(context.userId, 'coach');
            if (!conversation) conversation = await MemoryService.createConversation(context.userId, 'coach');

            if (conversation) {
                await MemoryService.addMessage(context.userId, conversation.id, 'user', sanitizedMessage);
                await MemoryService.addMessage(context.userId, conversation.id, 'assistant', coachResponse.summary, {
                    structured: coachResponse
                });
            }

            // 8. Log Audit
            await logAIRequest(context.userId, '/api/coach', context.request, true);

            return apiSuccess({ response: coachResponse });

        } catch (error: any) {
            console.error("Coach V4 Error:", error);
            // Fallback
            return apiSuccess({
                response: {
                    mode: 'refusal',
                    summary: "I encountered an internal error processing your request.",
                    refusal: { reason: error.message }
                } as CoachResponse
            });
        }
    },
    { requireAuth: true, rateLimit: 'ai', auditAction: 'coach_chat' }
);
