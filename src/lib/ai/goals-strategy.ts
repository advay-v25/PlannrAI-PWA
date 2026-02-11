import { groqChat } from './groq-client';
import { Goal, Profile, Commitment } from '@/types/database';

interface ExpertStrategyRequest {
    goal: Goal;
    user_profile: Partial<Profile>;
    active_goals: Goal[];
    anchors_summary: string; // "Gym: Mon/Wed/Fri 7am-8am"
    sleep: { start: string; end: string };
    meals: number;
    buffers: number;
}

export async function runExpertStrategy(
    input: string,
    context: ExpertStrategyRequest,
    userId: string
) {
    const SYSTEM_PROMPT = `
You are the Expert Strategy Engine for PlannrAI.
Your job is to take a user's goal and "Expert Edit" it into a highly executable protocol.

Authorize Output Format: STRICT JSON.
{
  "suggested_minutes_per_session": number,
  "suggested_days_per_week": number,
  "preferred_windows": ["morning"|"afternoon"|"evening"],
  "energy": "light"|"medium"|"heavy",
  "priority_recommendation": "low"|"medium"|"high",
  "rationale_bullets": [
    "Bullet 1: Why this duration/frequency?",
    "Bullet 2: Why this energy/window?",
    "Bullet 3: Handling constraints"
  ],
  "strategy_one_liner": "A punchy ethos for this goal",
  "next_actions": [
     {"type":"apply_to_goal","label":"Apply Strategy","payload":{ "minutes_per_day": number, "days_per_week": number, "energy_demand": string, "priority": string, "preferred_windows": string[] }},
     {"type":"schedule_now","label":"Auto-Schedule","payload":{}} 
  ]
}

Rules:
1. "suggested_minutes_per_session" must be realistic (15-120 mins).
2. "suggested_days_per_week" must reflect the nature of the goal (Skill = high freq, Project = high duration).
3. "preferred_windows" must respect the user's anchors and sleep.
4. "rationale_bullets" must be high-signal, no fluff.
`.trim();

    const USER_PROMPT = `
Goal: ${context.goal.title} (Current: ${context.goal.minutes_per_day}m, ${context.goal.days_per_week}d/wk)
Category: ${context.goal.category}
User Input/Intent: "${input}"

Context:
- Sleep: ${context.sleep.start} to ${context.sleep.end}
- Anchors: ${context.anchors_summary}
- Active Goals Count: ${context.active_goals.length}

Generate the Expert Strategy JSON.
`.trim();

    const responseText = await groqChat({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: USER_PROMPT }
        ],
        temperature: 0.3, // Deterministic but creative
        max_tokens: 1000,
        userId
    });

    // Parse JSON safely
    try {
        const jsonStr = responseText.replace(/^```json/i, '').replace(/```$/, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Expert Strategy JSON Parse Error", e);
        throw new Error("AI produced invalid JSON");
    }
}
