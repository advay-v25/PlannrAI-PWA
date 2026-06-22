import { NextResponse } from 'next/server';
import { buildCoachContext } from '@/lib/coach/context-builder';
import { classifyIntent } from '@/lib/coach/intent-classifier';
import { generateCoachResponse } from '@/lib/coach/response-generator';
import { secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';
import { ConflictService } from '@/lib/scheduling/conflict-service';

export const maxDuration = 60; // 60s limit (requires Pro, but gives maximum Hobby allowance)

interface GenerateOptionsRequest {
    message: string;
    conversation_id: string;
    date?: string; // Client's ISO timestamp
    clientTimezone?: string;
}

export const POST = secureApiRoute(
    async (context: SecureApiContext, body: any) => {
        const startTime = Date.now();

        try {
            const { user, supabase } = context;
            const { message, conversation_id, clientTimezone, date: clientDate } = body as GenerateOptionsRequest;

            if (!message || !conversation_id) {
                return NextResponse.json(
                    { success: false, error: 'Message and conversation_id are required' },
                    { status: 400 }
                );
            }

            // Fetch history
            const { data: history } = await supabase
                .from('coach_messages')
                .select('role, content')
                .eq('conversation_id', conversation_id)
                .order('created_at', { ascending: false })
                .limit(15);

            const fullHistory = (history || []).reverse();
            // In Phase 2, the Phase 1 message might already be in DB, but we don't strictly need to slice it off
            // since we just want the conversation history. However, we'll use the raw context.
            const conversationHistory = fullHistory;

            // Rebuild minimal context for classification
            const profileRes = await supabase.from('profiles').select('id, first_name, timezone').eq('id', user.id).single();
            const timezone = profileRes.data?.timezone || clientTimezone || 'UTC';
            const now = clientDate ? new Date(clientDate) : new Date();
            const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
            const today = dateFormatter.format(now);

            const [goalsRes, todayBlocksRes] = await Promise.all([
                supabase.from('goals').select('title').eq('user_id', user.id).eq('status', 'active'),
                supabase.from('schedule_blocks').select('title, context, start_time, end_time, status').eq('user_id', user.id).eq('date', today)
            ]);

            const lightContext = {
                current_time: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now),
                current_date: today,
                today_blocks: todayBlocksRes.data || [],
                goals: goalsRes.data || [],
                user_id: user.id,
                first_name: profileRes.data?.first_name || '',
                timezone,
            };

            const intentClassification = await classifyIntent(
                message,
                conversationHistory,
                lightContext as any
            );

            // Re-run the pre-resolved block lookup since this is stateless
            let preResolvedBlock: any = null;
            if (intentClassification.primary_intent === 'move_block' || intentClassification.primary_intent === 'busy_at_time') {
                const msgLower = message.toLowerCase();
                const searchDates: string[] = [];
                for (let i = -1; i <= 7; i++) {
                    const dt = new Date(today + 'T12:00:00');
                    dt.setDate(dt.getDate() + i);
                    searchDates.push(dt.toISOString().split('T')[0]);
                }

                const { data: candidates } = await supabase
                    .from('schedule_blocks')
                    .select('id, title, context, date, start_time, end_time, status, block_type, goal_id')
                    .eq('user_id', user.id)
                    .in('date', searchDates);

                if (candidates && candidates.length > 0) {
                    const scored = candidates.map((b: any) => {
                        let score = 0;
                        const bTitle = (b.title || b.context || '').toLowerCase();
                        if (bTitle.length >= 2 && msgLower.includes(bTitle)) score += 3;
                        if (b.status === 'missed') score += 3;
                        if (b.date === today) score += 1;
                        return { block: b, score };
                    });
                    scored.sort((a: any, b: any) => b.score - a.score);
                    if (scored[0].score > 0) preResolvedBlock = scored[0].block;
                }
            }

            // Build FULL context
            const fullCoachContext = await buildCoachContext(user.id, supabase, clientDate, timezone);
            (fullCoachContext as any).pre_resolved_block = preResolvedBlock;

            const currentSchedule = [...(fullCoachContext.schedule.today || []), ...(fullCoachContext.schedule.this_week || [])];
            
            // EXECUTION PHASE (HEAVY LIFTING)
            let response = await generateCoachResponse(
                message,
                conversationHistory,
                fullCoachContext,
                supabase,
                null,
                intentClassification
            );

            // Validation Loop
            let retryCount = 0;
            let valid = false;
            
            while (!valid && retryCount < 1) {
                let conflictErrors: string[] = [];
                
                if (response.executed_ledger && response.executed_ledger.ops) {
                    const val = ConflictService.validateAIPatch(currentSchedule as any, response.executed_ledger.ops);
                    if (!val.valid) conflictErrors.push(...val.errors);
                }
                if (response.proposed_options) {
                    for (const opt of response.proposed_options) {
                        if (opt.ledger && opt.ledger.ops) {
                            const val = ConflictService.validateAIPatch(currentSchedule as any, opt.ledger.ops);
                            if (!val.valid) conflictErrors.push(...val.errors);
                        }
                    }
                }
                
                if (conflictErrors.length > 0) {
                    retryCount++;
                    console.warn(`[Coach AI] Conflict detected in Phase 2. Retrying... Errors:`, conflictErrors);
                    
                    const retryHistory = [...conversationHistory, {
                        role: 'user',
                        content: `SYSTEM REJECTION: Your last schedule patch contained overlaps or violated immutable blocks. Errors: ${conflictErrors.join('; ')}. Recalculate and output a new patch ensuring NO overlaps. Use a different time slot.`
                    }];
                    
                    response = await generateCoachResponse(
                        message,
                        retryHistory,
                        fullCoachContext,
                        supabase,
                        null,
                        intentClassification
                    );
                } else {
                    valid = true;
                }
            }

            // Overwrite the original Phase 1 message with the fully generated options
            // Fetch the last assistant message ID to update
            const { data: lastAssistantMsg } = await supabase
                .from('coach_messages')
                .select('id')
                .eq('conversation_id', conversation_id)
                .eq('role', 'assistant')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (lastAssistantMsg) {
                await supabase.from('coach_messages').update({
                    content: response.dialogue_response || (response as any).summary,
                    options: response.proposed_options || (response as any).options || null,
                    mode: response.execution_mode || (response as any).mode,
                }).eq('id', lastAssistantMsg.id);
            }

            const latency = Date.now() - startTime;
            console.log(`[Coach] Phase 2 Options generated in ${latency}ms`);

            return NextResponse.json({
                success: true,
                response,
                meta: { latency_ms: latency }
            });

        } catch (error) {
            console.error('[Coach] Phase 2 error:', error);
            return NextResponse.json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, { status: 500 });
        }
    }, { requireAuth: true, rateLimit: 'aiCoach', auditAction: 'coach_options_generate' }
);
