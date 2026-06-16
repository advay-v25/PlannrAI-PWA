# ANTIGRAVITY PROMPT 5D — Fix MOVE_BLOCK Rescheduling (3-Option Flow)

## Context

When a user sends a manual rescheduling message like **"I missed my Reading block from 10:30am–11:15am earlier today, reschedule it"**, Donna (the AI coach) should respond with exactly 3 rescheduling options and a "Review & Execute" flow. Instead it replies with a generic list like:

> "I can see blocks in your schedule: 'Sleep' at 00:00, 'Breakfast' at 08:30, 'PlannrAI' at 09:15. Which one would you like to reschedule?"

**Root causes** (all must be fixed):

1. **Wrong model** — `isMissedBlock` paths use `model: 'fast'` + `useNvidia: false`. This routes to `llama-3.1-8b-instant` (8B) when OpenRouter fails. The 8B model cannot produce valid 3-option scheduling JSON. The AI call fails → fallback fires.
2. **No direct NVIDIA path** — Even the `useNvidia: true` path starts with OpenRouter. The fix: skip OpenRouter entirely for MOVE_BLOCK and go straight to NVIDIA 70B.
3. **Fallback ignores `pre_resolved_block`** — The server correctly identifies the exact block the user mentioned and stores it in `coachCtx.pre_resolved_block`, but the fallback for MOVE_BLOCK completely ignores it.
4. **`today` + `this_week` duplication** — Both arrays contain today's blocks. `slice(0, 3)` always returns the first 3 blocks from today (Sleep 00:00, Breakfast 08:30, PlannrAI 09:15) — never the user's actual block.
5. **Timezone not forwarded to message API** — `sendMessage` in `use-coach.ts` sends `date: new Date().toISOString()` but no timezone. If `profile.timezone` is null in Supabase, the server defaults to UTC.

---

## Changes Required — 4 Files

---

### FILE 1: `src/lib/ai/unified-client.ts`

#### Change 1A — Add `skipOpenRouter` to `AICallOptions`

Find this exact block:

```typescript
    useNvidia?: boolean; // Use dedicated CALENDAR_NVIDIA_API_KEY for Coach & Calendar
    userId?: string; // Optional user ID for logging/auditing
```

Replace with:

```typescript
    useNvidia?: boolean; // Use dedicated CALENDAR_NVIDIA_API_KEY for Coach & Calendar
    skipOpenRouter?: boolean; // When true, skip OpenRouter and go straight to NVIDIA 70B (for MOVE_BLOCK — avoids OpenRouter latency eating into the budget)
    userId?: string; // Optional user ID for logging/auditing
```

#### Change 1B — Respect `skipOpenRouter` in the `useNvidia` provider chain

Find this exact block (inside the `if (options.useNvidia)` branch):

```typescript
        const nvidiaChain: ProviderConfig[] = [];
        if (useOpenRouter) nvidiaChain.push(getOpenRouterConfig(
            tier === 'fast' ? 'openai/gpt-4o-mini' : 'meta-llama/llama-3.3-70b-instruct'
        ));
        nvidiaChain.push(getNvidiaConfig(nvidiaModel, process.env.CALENDAR_NVIDIA_API_KEY));
```

Replace with:

```typescript
        const nvidiaChain: ProviderConfig[] = [];
        if (useOpenRouter && !options.skipOpenRouter) nvidiaChain.push(getOpenRouterConfig(
            tier === 'fast' ? 'openai/gpt-4o-mini' : 'meta-llama/llama-3.3-70b-instruct'
        ));
        nvidiaChain.push(getNvidiaConfig(nvidiaModel, process.env.CALENDAR_NVIDIA_API_KEY));
```

---

### FILE 2: `src/lib/coach/response-generator.ts`

#### Change 2A — Use smart model + NVIDIA-direct for ALL schedule AI calls

Find this exact block (the `callAI` options inside `generateAIScheduleResponse`):

```typescript
            model: isMissedBlock ? 'fast' : 'smart',
            temperature: 0.5,
            maxTokens: 2500,
            requireJSON: true,
            timeout: isMissedBlock ? 25000 : 55000,
            useNvidia: isMissedBlock ? false : true,
```

Replace with:

```typescript
            model: 'smart',
            temperature: 0.5,
            maxTokens: 2500,
            requireJSON: true,
            timeout: 55000,
            useNvidia: true,
            skipOpenRouter: isMissedBlock, // MOVE_BLOCK: skip OpenRouter, go straight to NVIDIA 70B — no latency wasted on OpenRouter before the 70B model
```

#### Change 2B — Fix `generateFallbackResponse` MOVE_BLOCK case

Find this exact block:

```typescript
    } else if (intent === CoachIntent.MOVE_BLOCK) {
        const allBlocks = [...(coachCtx.schedule?.today || []), ...(coachCtx.schedule?.this_week || [])];
        const missedOrRecentBlocks = allBlocks.filter((b: any) =>
            b.status === 'missed' || b.status === 'planned'
        ).slice(0, 3);

        if (missedOrRecentBlocks.length > 0) {
            const blockList = missedOrRecentBlocks.map((b: any) =>
                `"${(b as any).title || b.context}" at ${b.start_time}`
            ).join(', ');
            summary = `I can see blocks in your schedule: ${blockList}. Which one would you like to reschedule, and what time should it move to?`;
        } else {
            summary = `Tell me the block name and time you'd like to move — I'll find the best slot for it.`;
        }
    } else {
```

Replace with:

```typescript
    } else if (intent === CoachIntent.MOVE_BLOCK) {
        // First: check if the server already identified the exact block
        const preResolved = (coachCtx as any).pre_resolved_block;
        const targetBlock = preResolved || findMissedBlock(userMessage, classification, coachCtx);

        if (targetBlock) {
            // We found the specific block the user mentioned — acknowledge it and ask them to retry
            const blockName = (targetBlock as any).title || targetBlock.context || 'this block';
            const blockTime = (targetBlock.start_time || '').substring(0, 5);
            summary = `I found your "${blockName}" block (originally at ${blockTime}). The rescheduling engine is momentarily busy — please resend your message and I'll generate your 3 options right away.`;
        } else {
            // Block not found — show a de-duplicated list (today only, not today+this_week which causes duplicates)
            const todayBlocks = coachCtx.schedule?.today || [];
            const weekOnlyBlocks = (coachCtx.schedule?.this_week || []).filter(
                (b: any) => b.date && b.date !== coachCtx.current.date
            );
            const allUnique = [...todayBlocks, ...weekOnlyBlocks];
            const relevant = allUnique
                .filter((b: any) => b.status === 'missed' || b.status === 'planned')
                .slice(0, 3);

            if (relevant.length > 0) {
                const blockList = relevant
                    .map((b: any) => `"${(b as any).title || b.context}" at ${(b.start_time || '').substring(0, 5)}`)
                    .join(', ');
                summary = `Which block would you like to reschedule? I can see: ${blockList}. Mention the block name or time and I'll find the best slot.`;
            } else {
                summary = `Tell me the block name and time you'd like to reschedule — I'll find the best available slot for it.`;
            }
        }
    } else {
```

---

### FILE 3: `src/hooks/use-coach.ts`

#### Change 3A — Forward client timezone in `sendMessage`

Find this exact block:

```typescript
          const raw = await apiClient.post('/api/coach/message', {
            message: text,
            conversation_id: get().conversationId,
            date: new Date().toISOString()
          });
```

Replace with:

```typescript
          const raw = await apiClient.post('/api/coach/message', {
            message: text,
            conversation_id: get().conversationId,
            date: new Date().toISOString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
```

#### Change 3B — Forward client timezone in `refreshContext` too

Find this exact block:

```typescript
          const raw = await apiClient.post('/api/coach/message', {
            message: "Analyze my current context and give me an immediate execution and performance insight.",
            conversation_id: get().conversationId,
            date: new Date().toISOString()
          });
```

Replace with:

```typescript
          const raw = await apiClient.post('/api/coach/message', {
            message: "Analyze my current context and give me an immediate execution and performance insight.",
            conversation_id: get().conversationId,
            date: new Date().toISOString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
```

---

### FILE 4: `src/app/api/coach/message/route.ts`

#### Change 4A — Add `clientTimezone` to the request interface

Find this exact block:

```typescript
interface MessageRequest {
    message: string;
    conversation_id?: string;
}
```

Replace with:

```typescript
interface MessageRequest {
    message: string;
    conversation_id?: string;
    clientTimezone?: string; // Browser timezone (e.g. "Asia/Kolkata") — used as fallback if profile.timezone is null
}
```

#### Change 4B — Destructure `clientTimezone` from the body

Find this exact line:

```typescript
        const { message, conversation_id } = body as MessageRequest;
```

Replace with:

```typescript
        const { message, conversation_id, clientTimezone } = body as MessageRequest;
```

#### Change 4C — Use `clientTimezone` as fallback for null profile timezone

Find this exact line:

```typescript
        const timezone = profileRes.data?.timezone || 'UTC';
```

Replace with:

```typescript
        const timezone = profileRes.data?.timezone || clientTimezone || 'UTC';
```

---

## Summary of What This Fixes

| Bug | Root Cause | Fix |
|---|---|---|
| 3 options never shown | 8B model (`llama-3.1-8b-instant`) fails to generate valid scheduling JSON | Changed to `model: 'smart'` (70B) for ALL schedule AI calls |
| OpenRouter latency wastes the budget | OpenRouter tried first, consumes time before NVIDIA 70B gets a chance | `skipOpenRouter: isMissedBlock` → MOVE_BLOCK goes straight to NVIDIA 70B |
| Fallback shows Sleep/Breakfast/PlannrAI | `today + this_week` duplication → `slice(0,3)` always returns today's first 3 blocks | De-duplicated: use `todayBlocks + weekOnlyBlocks` (filter out today from this_week) |
| Fallback ignores the user's specific block | `pre_resolved_block` (server-identified block) completely ignored in fallback | Fallback now checks `pre_resolved_block` first, acknowledges the specific block |
| Wrong time when profile timezone is null | `profile.timezone \|\| 'UTC'` → defaults UTC if Supabase timezone is unset | Accept `clientTimezone` from browser, use as fallback chain: `profile.timezone \|\| clientTimezone \|\| 'UTC'` |

## Do NOT change

- The `isMissedBlock` detection logic (lines 871–874 in response-generator.ts) — it is correct
- The `optionsInstruction` for MOVE_BLOCK (the 3-option prompt text) — it is correct
- The `pre_resolved_block` server-side lookup in `message/route.ts` — it is correct
- The `findMissedBlock` function — it is correct
- The `handleQuickAction` client timezone code in `CoachChat.tsx` — already correct from Prompt 5B
- The `buildCoachContext` function in `context-builder.ts` — do not touch
- Any other files not listed above
