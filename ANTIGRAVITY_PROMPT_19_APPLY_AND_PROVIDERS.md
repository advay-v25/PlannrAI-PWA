# PROMPT 19: Make Weekly Review's apply path safe and correct, and put the AI summary on its own provider chain

New API keys are already in `.env.local`. Four fixes. **§3 and §4 are the important ones** — the apply path is currently destructive and plans the wrong week.

---

## §1. THE BUG YOU MUST FIX FIRST — `replan_week` destroys next week and plans the wrong one

`src/lib/services/patch-service.ts`, `case 'replan_week'` (~line 1516). Read it carefully before changing anything.

It computes `weekStartStr` as **this week's Monday**, generates a plan for **the current week**, then:

```ts
// deletes EVERY future block, with no upper bound
.gt('date', todayStr)
```

```ts
// but only re-inserts blocks from the CURRENT week
if (b.date <= todayStr) return false;
```

Two consequences, both bad:

1. **The delete has no end date.** It removes every non-immutable future block — including anything already planned for next week and beyond — while only re-inserting within the current week. Any pre-planned future week is destroyed and never replaced.
2. **Run it on a Sunday** — the intended weekly-review cadence — and `todayStr` is Sunday, so every block in the generated current-week plan fails the `date > todayStr` filter. `blocksToInsert` is **empty**. The result is a pure deletion of next week's schedule with nothing put back.

**Do not "fix" `replan_week` itself.** The coach depends on its current mid-week semantics ("redo the rest of this week from tomorrow"). Changing it would alter coach behaviour.

### Add a new op instead: `plan_next_week`

New case in the same switch, modelled on `replan_week` but scoped to the coming week:

- Compute **next Monday** in the user's timezone (`localMonday + 7 days`) and **next Sunday** (`+13 days`).
- `generateWeekPlan(calendarCtx, nextMondayStr, mode, allowWeekend, undefined, nextMondayStr)` — the replan-from date is next Monday, not tomorrow, so the whole week is planned.
- **Delete only inside that window**: `.gte('date', nextMondayStr).lte('date', nextSundayStr)`, keeping the existing exclusions — `sleep`, `meal`, `wind_down`, `anchor`, `is_locked`, and `status === 'done'`.
- Insert only blocks whose `date` falls in that same window.
- **Never touch any block dated on or before today.** Add an explicit guard, not just an implicit one.

Route it through `PatchService.applyPatch` exactly as `replan_week` does, so the existing undo machinery records it and `/api/calendar/undo` can reverse it.

---

## §2. Weekly Review applies to next week, not this one

In `src/app/api/weekly-review/execute/route.ts`, replace the `replan_week` op with **`plan_next_week`**.

This is the correct semantic: a weekly review looks back at a finished week and sets up the one ahead. It should never rewrite the week the user is currently living in.

Also guard the goal updates so nothing pre-existing breaks:

- **Only touch goals in the `changes` array.** Never a blanket update.
- Before applying, re-verify each `goal_id` belongs to this user and is not already paused/archived. Skip silently if it is — a stale proposal from a page left open must not resurrect or re-pause a goal.
- **Clamp the values.** `minutes_per_day` to 10–480; `days_per_week` to 1–7. A malformed proposal must never write a nonsense target that the scheduler then tries to satisfy.
- Keep the existing behaviour where `delete` pauses and archives rather than deleting.
- If **zero** changes apply, do not call the patch at all (already true — keep it).

---

## §3. Confirmation guard on Automatic

There is currently **no confirmation anywhere** in `src/app/app/weekly-review/page.tsx`. One click on Automatic pauses goals and rewrites a week. On the current data that is **8 goals paused in a single click.**

Add a confirmation step before **Automatic** and before **Semi-Automated's final apply**:

- A modal titled **"Apply these changes?"** listing, in plain language:
  - how many goals will be **paused**, **by name**
  - how many will have their **time or days changed**, with old → new
  - one line: *"Next week's schedule will be regenerated. This week is not affected."*
- Primary button **Apply changes**; secondary **Cancel**. Cancel is the default focus.
- If any goal will be paused, the count appears in the button label: **"Pause 8 goals and apply"** — the destructive part must be visible on the button itself, not just in the body text.
- Do **not** use `window.confirm` — it blocks the event loop and looks broken in a PWA. Build it with the existing modal pattern in the codebase.

After a successful apply, show a toast with an **Undo** action wired to `/api/calendar/undo`, since §1 routes the change through `PatchService` and the undo entry will exist.

---

## §4. Give the AI summary its own provider chain

`generate-report` passes `useNvidia: true`, which selects the **Coach/Calendar engine** — shared with `generate-today` and `response-generator`. A once-a-week batch job should not compete for the same providers and rate limits as the real-time coach.

### 4a. Fix the dead NVIDIA model IDs

`src/lib/ai/unified-client.ts` references three NVIDIA models, and **all three are stale**:

- line ~135 and ~136: `meta/llama-3.1-70b-instruct`
- line ~147: `meta/llama-3.1-8b-instruct`
- `nvidiaModel` (~line 439): `meta/llama-3.3-70b-instruct` — confirmed EOL 2026-08-26T09:00:00Z in the server log

Llama 3.1 predates the 3.3 that was just retired, so treat all three as gone.

**Do not hardcode replacements.** Make them configurable so the next retirement is a config change, not a code change:

```ts
process.env.NVIDIA_MODEL_LARGE ?? '<current large model>'
process.env.NVIDIA_MODEL_SMALL ?? '<current small model>'
```

Verify the current model IDs against NVIDIA's live catalogue before choosing defaults, and **state in your summary which IDs you used and where you confirmed them.** Do not guess.

> Note: Groq's `llama-3.3-70b-versatile` is **still a current production model** — its 404 was *"or you do not have access to it"*, i.e. the key. Leave that model ID alone.

### 4b. Route the summary to its own chain

Weekly review's needs are the opposite of the coach's: latency is irrelevant (it loads behind an already-rendered dashboard), correctness of JSON matters, and it runs once per user per week.

- Drop `useNvidia: true` from `generate-report`.
- Give it a **Gemini-first** ordering, falling back to Groq, then OpenRouter. Gemini Flash is cheap, has strong structured-JSON output, and has stable model naming.
- Implement this **without editing the provider-chain logic** if possible — prefer a new option flag consumed by `callAI`. If a new field on `AICallOptions` is unavoidable, add only that field and leave every existing chain untouched.

### 4c. Make the next failure diagnosable

`circuitBreakers` is module-private and nothing exports it, so breaker state can't be read. Add:

```ts
export function getCircuitStates(): Record<string, { state: string; failures: number }>
```

Log it from `generate-report`'s catch alongside the provider error. This is a three-line addition — do not change any breaker behaviour.

---

## §5. Do not touch

`src/lib/agents/**`, `src/lib/calendar/**` (the generator itself — you are only adding a new PatchService case), `src/stores/**`, `src/middleware.ts`, `public/sw.js`, `public/manifest.json`.

Do not modify `case 'replan_week'` — the coach depends on it. Add `plan_next_week` alongside it.

Do not change the circuit-breaker thresholds, the fallback ordering for the coach engine, or key handling.

---

## Verification (required)

1. `npm run build` passes.
2. **The Sunday case.** Set the system date to a Sunday (or stub `todayStr`) and run Automatic. Confirm next week is **fully planned**, Monday through Sunday, and that the old `replan_week` behaviour would have produced zero inserts. This is the bug that motivates §1.
3. **The mid-week case.** Run Automatic today. Confirm **not a single block dated today or earlier changed**, and that this week's remaining days are untouched. Only next Mon–Sun is rewritten.
4. **Nothing pre-existing breaks.** Confirm `sleep`, `meal`, `wind_down`, `anchor`, locked and `status: 'done'` blocks all survive inside the target window.
5. **Goals.** Only goals named in `changes` are modified. An already-paused goal in a stale payload is skipped. `minutes_per_day` outside 10–480 is clamped, not written raw.
6. **Confirmation.** Automatic shows the modal, names the goals to be paused, and the button reads "Pause N goals and apply". Cancel changes nothing at all. Semi-Automated's final apply shows the same modal.
7. **Undo.** After applying, the toast's Undo restores the previous state — goals and schedule both.
8. **Run it for real, on a scratch user**, end to end: proposals → confirm → apply → next week populated → undo → back to the starting state. Report the block counts before and after.
9. **The AI summary now generates.** Report which provider answered and the latency. If it still fails, paste the errors and `getCircuitStates()` output.
10. Confirm the coach and `generate-today` still work — they share `unified-client.ts` and must not regress.

---

## Note for the human

§1 is the one I'd not have found without reading `replan_week` line by line. Running a weekly review on a **Sunday — the exact cadence this feature is designed around — would have deleted next week's schedule and inserted nothing**, because every block in the generated current-week plan fails its `date > todayStr` filter. Mid-week it's less dramatic but still wrong: the delete has no upper bound, so it removes pre-planned future weeks it never replaces.

That is almost certainly why applying has never been tested safely. It isn't just risky, it's incorrect — and "plan next week" is both what you asked for and what the operation should always have meant.

The Groq correction in §4a matters too: Antigravity concluded the model was retired, but Groq still lists `llama-3.3-70b-versatile` as production. The 404 was an access problem, so your new key should fix it with no code change at all.
