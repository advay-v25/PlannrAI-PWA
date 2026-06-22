import { NextResponse } from 'next/server';
import { buildCoachContext } from '@/lib/coach/context-builder';
import { classifyIntent, CoachIntent } from '@/lib/coach/intent-classifier';
import { generateCoachResponse } from '@/lib/coach/response-generator';
import { secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';
import { ConflictService } from '@/lib/scheduling/conflict-service';

export const maxDuration = 60;

interface MessageRequest {
    message: string;
    conversation_id?: string;
    date?: string; // Client's ISO timestamp
    clientTimezone?: string; // Browser timezone (e.g. "Asia/Kolkata") — used as fallback if profile.timezone is null
}

export const POST = secureApiRoute(
    async (context: SecureApiContext, body: any) => {
        const startTime = Date.now();

        try {
            const { user, supabase } = context;
            const { message, conversation_id, clientTimezone, date: clientDate } = body as MessageRequest;

        if (!message || message.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Message is required' },
                { status: 400 }
            );
        }

        if (message.length > 1000) {
            return NextResponse.json(
                { success: false, error: 'Message too long (max 1000 characters)' },
                { status: 400 }
            );
        }

        let conversationId = conversation_id;

        if (!conversationId) {
            const { data: newConv, error: convError } = await supabase
                .from('coach_conversations')
                .insert({
                    user_id: user.id,
                    status: 'active',
                    started_at: new Date().toISOString(),
                    last_message_at: new Date().toISOString(),
                })
                .select('id')
                .single();

            if (convError) {
                console.error('Failed to create conversation:', convError);
                return NextResponse.json(
                    { success: false, error: 'Failed to start conversation' },
                    { status: 500 }
                );
            }

            conversationId = newConv.id;
        }

        await supabase.from('coach_messages').insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: 'user',
            content: message,
            created_at: new Date().toISOString(),
        });

        const { data: history } = await supabase
            .from('coach_messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(15);

        const fullHistory = (history || []).reverse();
        const conversationHistory = fullHistory.slice(0, -1);

        // OPTIMIZATION: Only build light context for intent classification
        const profileRes = await supabase.from('profiles').select('id, first_name, timezone').eq('id', user.id).single();
        const timezone = profileRes.data?.timezone || clientTimezone || 'UTC';
        const now = clientDate ? new Date(clientDate) : new Date();
        const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now));
        
        let logicalNow = now;
        let in_active_wake_cycle = false;
        
        if (hour >= 0 && hour < 6) {
            const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
            const { data: recentLog } = await supabase
                .from('daily_logs')
                .select('id, created_at')
                .eq('user_id', user.id)
                .gte('created_at', twelveHoursAgo)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!recentLog) {
                logicalNow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                in_active_wake_cycle = true;
            }
        }

        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const today = dateFormatter.format(logicalNow);
        const currentTime = timeFormatter.format(now);

        const [goalsRes, todayBlocksRes, energyRes, missedBlocksRes] = await Promise.all([
            supabase.from('goals').select('title').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('schedule_blocks').select('title, context, start_time, end_time, status').eq('user_id', user.id).eq('date', today),
            supabase.from('energy_checkins').select('energy_level').eq('user_id', user.id).order('checked_in_at', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'missed').gte('date', dateFormatter.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))),
        ]);

        const lightContext = {
            current_time: currentTime,
            current_date: today,
            exact_iso_timestamp: clientDate,
            in_active_wake_cycle,
            today_blocks: todayBlocksRes.data || [],
            goals: goalsRes.data || [],
            recent_energy: energyRes.data?.energy_level,
            user_id: user.id,
            first_name: profileRes.data?.first_name || '',
            timezone,
            missed_blocks: missedBlocksRes.count || 0,
        };

        const intentClassification = await classifyIntent(
            message,
            conversationHistory,
            lightContext
        );

        // ── Pre-flight block lookup for MOVE_BLOCK intents ───────────────────
        // When the user says "I missed my [BlockName] at [time] today/on [day]",
        // find the block server-side so the AI gets the exact ID and doesn't hallucinate.
        let preResolvedBlock: any = null;
        if (intentClassification.primary_intent === 'move_block' || intentClassification.primary_intent === 'busy_at_time') {
            const msgLower = message.toLowerCase();
            const searchDates: string[] = [];
            for (let i = -1; i <= 7; i++) {
                const dt = new Date(today + 'T12:00:00');
                dt.setDate(dt.getDate() + i);
                searchDates.push(dt.toISOString().split('T')[0]);
            }

            let targetDate = today;
            if (/yesterday/i.test(message)) {
                const yd = new Date(now.getTime() - 86400000);
                targetDate = dateFormatter.format(yd);
            } else if (/tomorrow/i.test(message)) {
                const tm = new Date(now.getTime() + 86400000);
                targetDate = dateFormatter.format(tm);
            } else {
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                for (let di = 0; di < days.length; di++) {
                    if (new RegExp(`\\b${days[di]}\\b`, 'i').test(message)) {
                        const match = searchDates.find(d => new Date(d + 'T12:00:00').getDay() === di);
                        if (match) targetDate = match;
                        break;
                    }
                }
            }

            const nearbyDates = searchDates.filter(d =>
                Math.abs(new Date(d).getTime() - new Date(targetDate).getTime()) <= 3 * 86400000
            );

            const { data: candidates } = await supabase
                .from('schedule_blocks')
                .select('id, title, context, date, start_time, end_time, status, block_type, goal_id')
                .eq('user_id', user.id)
                .in('date', nearbyDates);

            if (candidates && candidates.length > 0) {
                const scored = candidates.map((b: any) => {
                    let score = 0;
                    const bTitle = (b.title || b.context || '').toLowerCase();
                    const bWords = bTitle.split(/\s+/);
                    for (const word of bWords) {
                        // Match any word ≥ 2 chars so short block names like "Gym" still score
                        if (word.length >= 2 && msgLower.includes(word)) score += 2;
                    }
                    // Exact block title as substring scores extra (stronger signal)
                    if (bTitle.length >= 2 && msgLower.includes(bTitle)) score += 3;
                    const timeMatches = message.match(/\b(\d{1,2}):(\d{2})\b/g) || [];
                    for (const t of timeMatches) {
                        if (b.start_time?.startsWith(t.padStart(5, '0'))) score += 5;
                    }
                    const ampmMatches = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi) || [];
                    for (const t of ampmMatches) {
                        const parts = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
                        if (parts) {
                            let h = parseInt(parts[1]);
                            const m = parseInt(parts[2] || '0');
                            if (parts[3].toLowerCase() === 'pm' && h < 12) h += 12;
                            if (parts[3].toLowerCase() === 'am' && h === 12) h = 0;
                            const t24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                            if (b.start_time?.startsWith(t24)) score += 5;
                        }
                    }
                    if (b.status === 'missed') score += 3;
                    if (b.date === today) score += 1;
                    return { block: b, score };
                });
                scored.sort((a: any, b: any) => b.score - a.score);
                // Accept the top-scoring block as long as it has any signal at all
                if (scored[0].score > 0) preResolvedBlock = scored[0].block;
            }
        }

        // Actually build the FULL coach context for the response generation
        const fullCoachContext = await buildCoachContext(user.id, supabase);
        (fullCoachContext as any).pre_resolved_block = preResolvedBlock;
        fullCoachContext.current.exact_iso_timestamp = clientDate;
        fullCoachContext.current.exact_timezone = timezone;

        const currentSchedule = [...(fullCoachContext.schedule.today || []), ...(fullCoachContext.schedule.this_week || [])];
        
        let response = await generateCoachResponse(
            message,
            conversationHistory,
            fullCoachContext,
            supabase,
            null,
            intentClassification
        );

        // Internal LLM Retry Loop
        let retryCount = 0;
        let valid = false;
        
        while (!valid && retryCount < 0) {
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
                console.warn(`[Coach AI] Conflict detected. Retrying... Errors:`, conflictErrors);
                
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

        await supabase.from('coach_messages').insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: 'assistant',
            content: response.dialogue_response || (response as any).summary,
            intent: intentClassification.primary_intent,
            mode: response.execution_mode || (response as any).mode,
            options: response.proposed_options || (response as any).options || null,
            created_at: new Date().toISOString(),
        });

        let topicUpdate: any = {};
        if (conversationHistory.length === 0) { // Only set on first message
            if (intentClassification.primary_intent === CoachIntent.RESCHEDULE_DAY) {
                topicUpdate.primary_topic = "Fix Today's Schedule";
            } else if (intentClassification.primary_intent === CoachIntent.MINIMAL_OS) {
                topicUpdate.primary_topic = "Reduce Today's Load";
            } else if (preResolvedBlock?.title) {
                topicUpdate.primary_topic = `Reschedule: ${preResolvedBlock.title}`;
            } else if (intentClassification.primary_intent === CoachIntent.MOVE_BLOCK) {
                topicUpdate.primary_topic = "Reschedule Block";
            }
        }

        await supabase
            .from('coach_conversations')
            .update({
                last_message_at: new Date().toISOString(),
                total_messages: conversationHistory.length + 2,
                ...topicUpdate
            })
            .eq('id', conversationId);

        const latency = Date.now() - startTime;
        console.log(`[Coach] Message processed in ${latency}ms`);

        return NextResponse.json({
            success: true,
            conversation_id: conversationId,
            response,
            meta: {
                latency_ms: latency,
            },
        });

    } catch (error) {
        console.error('[Coach] Message error:', error);
        
        let errorMessage = 'Failed to process message. Please try again.';
        let errorDetails = undefined;
        
        if (error instanceof Error) {
            errorMessage = error.message;
            errorDetails = error.stack;
            console.error('[Coach] Stack trace:', error.stack);
        } else {
            console.error('[Coach] Unknown error object:', JSON.stringify(error, null, 2));
        }

        return NextResponse.json({
            success: false,
            error: errorMessage,
            details: errorDetails
        }, { status: 500 });
    }
}, { requireAuth: true, rateLimit: 'aiCoach', auditAction: 'coach_message' });
