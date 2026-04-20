/**
 * 🚀 PLANNRAI — UNIFIED AI CLIENT
 * Single entry point for all AI calls.
 * Supports OpenRouter and Groq with automatic fallback.
 */

// ── Types ────────────────────────────────────────────────────────

export type AIModel = 'smart' | 'fast' | 'creative';

export interface AICallOptions {
    prompt: string;
    systemPrompt?: string;
    model?: AIModel;
    temperature?: number;
    maxTokens?: number;
    requireJSON?: boolean;
    timeout?: number;
    calendarKey?: boolean; // Use dedicated CALENDAR_OPENROUTER_API_KEY
}

export interface AIResponse<T = any> {
    success: boolean;
    data?: T;
    raw?: string;
    error?: string;
    provider: 'openrouter' | 'groq';
    model: string;
    latency_ms: number;
    tokens_used?: number;
}

// ── Provider Config ──────────────────────────────────────────────

interface ProviderConfig {
    name: 'openrouter' | 'groq';
    url: string;
    model: string;
    getHeaders: () => Record<string, string>;
    supportsResponseFormat: boolean;
}

function getOpenRouterConfig(model: string): ProviderConfig {
    return {
        name: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://plannrai.com',
            'X-Title': 'PlannrAI',
        }),
        supportsResponseFormat: false,
    };
}

function getCalendarOpenRouterConfig(model: string): ProviderConfig {
    return {
        name: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${process.env.CALENDAR_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://plannrai.com',
            'X-Title': 'PlannrAI Calendar',
        }),
        supportsResponseFormat: false,
    };
}

function getGroqConfig(model: string): ProviderConfig {
    return {
        name: 'groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        }),
        supportsResponseFormat: true,
    };
}

// Map model tier → provider configs (primary, fallback)
// Smart = complex reasoning (coach, goals, weekly review) → OpenRouter primary
// Fast = simple extraction (brain dump, habits, briefings) → Groq primary
function getProviderChain(options: AICallOptions): [ProviderConfig, ProviderConfig] {
    const tier = options.model || 'fast';
    const getPrimaryOpenRouterConfig = options.calendarKey ? getCalendarOpenRouterConfig : getOpenRouterConfig;

    switch (tier) {
        case 'smart':
            return [
                getGroqConfig('llama-3.3-70b-versatile'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'),
            ];
        case 'fast':
            return [
                getGroqConfig('llama-3.3-70b-versatile'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'),
            ];
        case 'creative':
            return [
                getGroqConfig('llama-3.3-70b-versatile'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'),
            ];
        default:
            return [
                getGroqConfig('llama-3.3-70b-versatile'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'),
            ];
    }
}

// ── JSON Parsing (robust) ────────────────────────────────────────

function robustJSONParse(text: string): any {
    // 1. Direct parse
    try {
        return JSON.parse(text);
    } catch { /* continue */ }

    // 2. Extract from ```json blocks
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
        try {
            return JSON.parse(jsonBlockMatch[1]);
        } catch { /* continue */ }
    }

    // 3. Extract from ``` blocks (any language)
    const codeBlockMatch = text.match(/```\w*\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1]);
        } catch { /* continue */ }
    }

    // 4. Find first { ... } in text
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
        try {
            return JSON.parse(braceMatch[0]);
        } catch { /* continue */ }
    }

    // 5. Find first [ ... ] in text
    const bracketMatch = text.match(/\[[\s\S]*\]/);
    if (bracketMatch) {
        try {
            return JSON.parse(bracketMatch[0]);
        } catch { /* continue */ }
    }

    return null;
}

// ── Core Call Function ───────────────────────────────────────────

async function callProvider<T>(
    config: ProviderConfig,
    options: AICallOptions
): Promise<AIResponse<T>> {
    const startTime = Date.now();

    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    const body: any = {
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4000,
    };

    // Add response_format for providers that support it and when JSON required
    if (options.requireJSON && config.supportsResponseFormat) {
        body.response_format = { type: 'json_object' };
    }

    const timeout = options.timeout ?? (options.model === 'fast' ? 15000 : 25000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(config.url, {
            method: 'POST',
            headers: config.getHeaders(),
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${config.name} API ${response.status}: ${errorText.slice(0, 200)}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const latencyMs = Date.now() - startTime;

        if (!rawContent) {
            throw new Error(`${config.name} returned empty response`);
        }

        console.log(`\x1b[32m[AI ✓]\x1b[0m ${config.name}/${config.model} ${latencyMs}ms`);

        // JSON parsing if required
        if (options.requireJSON) {
            const parsed = robustJSONParse(rawContent);
            if (!parsed) {
                throw new Error(`${config.name} returned invalid JSON`);
            }
            return {
                success: true,
                data: parsed as T,
                raw: rawContent,
                provider: config.name,
                model: config.model,
                latency_ms: latencyMs,
                tokens_used: data.usage?.total_tokens,
            };
        }

        return {
            success: true,
            data: rawContent as unknown as T,
            raw: rawContent,
            provider: config.name,
            model: config.model,
            latency_ms: latencyMs,
            tokens_used: data.usage?.total_tokens,
        };

    } catch (error: any) {
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;
        const isTimeout = error.name === 'AbortError';
        const errorMsg = isTimeout ? `Timeout after ${timeout}ms` : error.message;

        console.log(`\x1b[31m[AI ✗]\x1b[0m ${config.name}/${config.model} ${latencyMs}ms — ${errorMsg}`);

        return {
            success: false,
            error: errorMsg,
            provider: config.name,
            model: config.model,
            latency_ms: latencyMs,
        };
    }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Call AI with automatic provider fallback.
 *
 * @param options - prompt, systemPrompt, model tier, etc.
 * @returns AIResponse with parsed data or error
 *
 * @example
 * const result = await callAI<{ variants: any[] }>({
 *   prompt: 'Generate a weekly schedule...',
 *   systemPrompt: 'You are a scheduling assistant.',
 *   model: 'smart',
 *   requireJSON: true,
 * });
 */
export async function callAI<T = any>(options: AICallOptions): Promise<AIResponse<T>> {
    const tier = options.model ?? 'fast';

    // Calendar-dedicated key: bypass normal provider chain
    if (options.calendarKey) {
        // Switch to Claude 3.5 Sonnet for hyper-fast, highly precise JSON generation.
        // This prevents the 60s Vercel Serverless Function Timeout that blocks Llama 3.3 70B.
        const calendarProvider = getCalendarOpenRouterConfig('anthropic/claude-3.5-sonnet');
        const result = await callProvider<T>(calendarProvider, options);
        if (result.success) return result;
        // Fall back to Groq Llama 3.3 70B if calendar key fails
        console.log('\x1b[33m[AI →]\x1b[0m Calendar key failed, falling back to Groq...');
        const groqFallback = getGroqConfig('llama-3.3-70b-versatile');
        return callProvider<T>(groqFallback, options);
    }

    const [primary, fallback] = getProviderChain(options);

    // Try primary
    const primaryResult = await callProvider<T>(primary, options);
    if (primaryResult.success) {
        return primaryResult;
    }

    // Fallback
    console.log(`\x1b[33m[AI →]\x1b[0m Falling back to ${fallback.name}...`);
    const fallbackResult = await callProvider<T>(fallback, options);
    if (fallbackResult.success) {
        return fallbackResult;
    }

    // Both failed
    return {
        success: false,
        error: `All providers failed. Primary: ${primaryResult.error}. Fallback: ${fallbackResult.error}`,
        provider: primary.name,
        model: primary.model,
        latency_ms: primaryResult.latency_ms + fallbackResult.latency_ms,
    };
}
