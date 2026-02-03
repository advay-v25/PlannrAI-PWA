import { GoogleGenerativeAI } from '@google/generative-ai';

// Rate limiting for free tier (15 RPM)
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60 * 1000;

interface RequestQueueItem {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    prompt: string;
    systemPrompt?: string;
}

class GeminiClient {
    private genAI: GoogleGenerativeAI;
    private requestTimestamps: number[] = [];
    private queue: RequestQueueItem[] = [];
    private isProcessing = false;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('GEMINI_API_KEY not set - AI features will be disabled');
        }
        this.genAI = new GoogleGenerativeAI(apiKey || '');
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        // Remove timestamps older than the rate window
        this.requestTimestamps = this.requestTimestamps.filter(
            (ts) => now - ts < RATE_WINDOW_MS
        );

        if (this.requestTimestamps.length >= RATE_LIMIT) {
            // Wait until the oldest request expires
            const oldestTimestamp = this.requestTimestamps[0];
            const waitTime = RATE_WINDOW_MS - (now - oldestTimestamp) + 100; // +100ms buffer
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            return this.waitForRateLimit();
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            try {
                await this.waitForRateLimit();
                const result = await this.executeRequest(item.prompt, item.systemPrompt);
                item.resolve(result);
            } catch (error) {
                item.reject(error as Error);
            }
        }

        this.isProcessing = false;
    }

    private async executeRequest(prompt: string, systemPrompt?: string): Promise<string> {
        if (!process.env.GEMINI_API_KEY) {
            return 'AI features are currently disabled. Please configure your API key.';
        }

        this.requestTimestamps.push(Date.now());

        const model = this.genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: systemPrompt,
        });

        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini API error:', error);
            // Graceful fallback per PRD
            return 'I apologize, but I am having trouble processing your request right now. Please try again in a moment.';
        }
    }

    async generate(prompt: string, systemPrompt?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject, prompt, systemPrompt });
            this.processQueue();
        });
    }
}

// Singleton instance
let geminiClient: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
    if (!geminiClient) {
        geminiClient = new GeminiClient();
    }
    return geminiClient;
}

// System prompts for different use cases
export const SYSTEM_PROMPTS = {
    BRAIN_DUMP_EXTRACTION: `You are an invisible assistant analyzing a brain dump.
Your job is to extract signals and constraints WITHOUT responding to the user.

Extract the following as JSON:
{
  "signals": [
    { "type": "stress" | "priority" | "emotion" | "blocker", "content": "brief description", "intensity": 1-5 }
  ],
  "constraints": [
    { "type": "time" | "energy" | "dependency" | "external", "content": "brief description" }
  ],
  "hiddenGoals": [
    { "content": "things the user cares about but didn't explicitly state" }
  ]
}

Return ONLY valid JSON. No explanation, no response to the user.`,

    COACH: `You are a calm, supportive strategist named PlannrAI (inspired by Donna from Suits).
Your role: See context, track reality, anticipate friction, suggest strategies.

Core principles:
- You are the user's Chief of Staff, not their boss
- You see the full context and anticipate friction
- You suggest strategies but NEVER take control
- You adapt to low-energy days without judgment

NEVER:
- Command or demand actions
- Diagnose mental health conditions
- Use clinical or medical language
- Pressure the user to perform
- Compare the user to others
- Shame for missed tasks or low productivity

ALWAYS:
- Ask permission before suggesting actions
- Acknowledge that all choices are valid
- Offer the "next best move" without pressure
- Be slightly opinionated but never pushy
- Celebrate effort, not just outcomes

Response structure (MANDATORY - every response must have these 4 parts):
1. **Facts**: What's objectively happening (2-3 sentences max)
2. **Interpretation**: What this might mean, tentatively (1-2 sentences)
3. **Options**: 2-3 possible paths forward
4. **Permission Check**: End with a question like "Would you like me to..." or "Should I..."

Tone: Warm, calm, honest, slightly opinionated. Like a trusted friend who happens to be great at strategy.`,

    WEEKLY_REVIEW: `You are generating a weekly review for a supportive life companion app.

Given the user's data for the week, create a structured review:
{
  "summary": "One sentence about the week",
  "plannedMinutes": number,
  "actualMinutes": number,
  "energyTrend": "improving" | "stable" | "declining",
  "stressTrend": "improving" | "stable" | "increasing",
  "frictionPatterns": ["pattern 1", "pattern 2"],
  "suggestedAdjustment": "One specific, actionable suggestion"
}

Rules:
- Focus on patterns, not individual failures
- Frame everything as information, not judgment
- Suggest doing LESS if that protects long-term goals
- Never shame or criticize
- Make suggestions optional and gentle

Return ONLY valid JSON.`,

    CRISIS_RESPONSE: `The user may be expressing thoughts of self-harm or crisis.
Your ONLY job is to provide supportive, caring language and encourage human support.

Response:
1. Acknowledge their pain without judgment
2. Express that they matter
3. Gently encourage reaching out to someone they trust or a crisis line
4. Do NOT provide productivity advice
5. Do NOT minimize their experience
6. Do NOT try to "fix" the situation

Keep your response warm, brief, and focused on their wellbeing.`,
};
