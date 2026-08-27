/**
 * 🚀 PLANNRAI — UNIFIED AI CLIENT
 * Single entry point for all AI calls.
 * Supports OpenRouter and Groq with automatic fallback.
 */

// ── Types ────────────────────────────────────────────────────────

type AIModel = 'smart' | 'fast' | 'creative';

export interface AICallOptions {
    prompt: string;
    systemPrompt?: string;
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    model?: AIModel;
    temperature?: number;
    maxTokens?: number;
    requireJSON?: boolean;
    timeout?: number;
    useNvidia?: boolean; // Use dedicated CALENDAR_NVIDIA_API_KEY for Coach & Calendar
    skipOpenRouter?: boolean; // When true, skip OpenRouter and go straight to NVIDIA 70B (for MOVE_BLOCK — avoids OpenRouter latency eating into the budget)
    strictNvidia?: boolean; // When true, ONLY uses NVIDIA endpoints, skipping OpenRouter, Gemini, and Groq entirely.
    /**
     * Weekly-review / batch chain: Gemini → Groq → OpenRouter.
     * Latency is irrelevant here (it loads behind an already-rendered
     * dashboard) but JSON correctness matters, so Gemini Flash leads.
     * Deliberately does NOT share the coach engine's providers or limits.
     */
    batchReview?: boolean;
    groqOnly?: boolean; // When true, use ONLY Groq (GROQ_MODEL_LARGE) with the FULL remaining time budget. No NVIDIA/Gemini/OpenRouter fallback. Used by the deterministic reschedule narrator. On failure, returns a clean error (hard fail).
    userId?: string; // Optional user ID for logging/auditing
    clientDate?: string; // Exact ISO string from the client
    clientTimezone?: string; // Browser's timezone string
}

export interface AIResponse<T = any> {
    success: boolean;
    data?: T;
    raw?: string;
    error?: string;
    provider: 'openrouter' | 'groq' | 'nvidia' | 'gemini' | 'cerebras';
    model: string;
    latency_ms: number;
    tokens_used?: number;
}

// ── Provider Config ──────────────────────────────────────────────

interface ProviderConfig {
    name: 'openrouter' | 'groq' | 'nvidia' | 'gemini' | 'cerebras';
    url: string;
    model: string;
    getHeaders: () => Record<string, string>;
    supportsResponseFormat: boolean;
}

/**
 * NVIDIA model IDs, configurable so the next retirement is a config change
 * rather than a code change.
 *
 * The previous defaults — meta/llama-3.1-70b-instruct, meta/llama-3.1-8b-instruct
 * and meta/llama-3.3-70b-instruct — are all gone: none appear in
 * GET https://integrate.api.nvidia.com/v1/models, and the 3.3 returned
 * "410 Gone ... end of life on 2026-08-26T09:00:00Z".
 *
 * Defaults below were verified with a live completion on this account AND
 * benchmarked on a realistic (~1.5k token) scheduling prompt, because the
 * coach caps each provider at 15s:
 *
 *   nvidia/nemotron-3-super-120b-a12b   7.2s   <- fastest accessible
 *   openai/gpt-oss-20b                 27.7s   exceeds the cap
 *   nvidia/nemotron-3.5-lightning-30b  27.7s   exceeds the cap
 *   openai/gpt-oss-120b                47.8s   exceeds the cap
 *   meta/*, ibm/*, mistralai/*         404      not entitled on this account
 *
 * Both tiers therefore point at the one model that answers inside the cap.
 * Set NVIDIA_MODEL_SMALL to a genuinely small model once the account has
 * access to one — that is exactly what these env vars are for.
 */
/**
 * Groq model IDs, configurable for the same reason as the NVIDIA ones below.
 *
 * `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` are BOTH absent from
 * this key's catalogue (GET https://api.groq.com/openai/v1/models returns 14
 * models, neither among them), which is why every Groq call — the first hop in
 * almost every chain — was 404ing.
 *
 * Defaults benchmarked on a realistic ~1.5k-token prompt in json_object mode:
 *
 *   openai/gpt-oss-120b   2.05s  valid JSON  <- large
 *   qwen/qwen3.8-27b      1.07s  valid JSON  <- small (fastest overall)
 *   groq/compound-mini    5.64s  valid JSON
 *   openai/gpt-oss-20b    400 "Failed to validate JSON"
 *   qwen/qwen3.6-27b      400 "Failed to validate JSON"
 */
const GROQ_MODEL_LARGE = process.env.GROQ_MODEL_LARGE ?? 'openai/gpt-oss-120b';
const GROQ_MODEL_SMALL = process.env.GROQ_MODEL_SMALL ?? 'qwen/qwen3.8-27b';

const NVIDIA_MODEL_LARGE = process.env.NVIDIA_MODEL_LARGE ?? 'nvidia/nemotron-3-super-120b-a12b';
const NVIDIA_MODEL_SMALL = process.env.NVIDIA_MODEL_SMALL ?? 'nvidia/nemotron-3-super-120b-a12b';

function getOpenRouterConfig(model: string): ProviderConfig {
    return {
        name: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://plannrai.in',
            'X-Title': 'PlannrAI'
        }),
        supportsResponseFormat: true,
    };
}
function getNvidiaConfig(model: string, keyOverride?: string): ProviderConfig {
    return {
        name: 'nvidia',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${keyOverride || process.env.CALENDAR_NVIDIA_API_KEY || process.env.NVIDIA_API_KEY}`,
            'Content-Type': 'application/json',
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

function getCerebrasConfig(model: string): ProviderConfig {
    return {
        name: 'cerebras',
        url: 'https://api.cerebras.ai/v1/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
            'Content-Type': 'application/json',
        }),
        supportsResponseFormat: true,
    };
}


function getGeminiConfig(model: string): ProviderConfig {
    return {
        name: 'gemini',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
            'Content-Type': 'application/json',
        }),
        supportsResponseFormat: true,
    };
}



// Smart = complex reasoning (coach, goals, weekly review)
// Fast  = quick extraction / reschedule options
function getProviderChain(options: AICallOptions): ProviderConfig[] {
    const tier = options.model || 'fast';
    const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const useGemini    = !!process.env.GEMINI_API_KEY;
    const useTertiary  = !!process.env.NVIDIA_API_KEY_TERTIARY;
    const useCerebras  = !!process.env.CEREBRAS_API_KEY;

    switch (tier) {
        case 'smart':
        case 'creative': {
            const chain: ProviderConfig[] = [];
            chain.push(getGroqConfig(GROQ_MODEL_LARGE));
            if (useOpenRouter) chain.push(getOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'));
            if (useCerebras) chain.push(getCerebrasConfig('llama3.1-70b'));
            chain.push(getNvidiaConfig(NVIDIA_MODEL_LARGE, process.env.CALENDAR_NVIDIA_API_KEY));
            if (useTertiary) chain.push(getNvidiaConfig(NVIDIA_MODEL_LARGE, process.env.NVIDIA_API_KEY_TERTIARY));
            if (useGemini) chain.push(getGeminiConfig('gemini-2.5-flash'));
            return chain;
        }
        case 'fast':
        default: {
            const chain: ProviderConfig[] = [];
            chain.push(getGroqConfig(GROQ_MODEL_SMALL));
            if (useOpenRouter) chain.push(getOpenRouterConfig('openai/gpt-4o-mini'));
            if (useCerebras) chain.push(getCerebrasConfig('llama3.1-8b'));
            if (useGemini) chain.push(getGeminiConfig('gemini-2.5-flash'));
            if (useTertiary) chain.push(getNvidiaConfig(NVIDIA_MODEL_SMALL, process.env.NVIDIA_API_KEY_TERTIARY));
            return chain;
        }
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

// ── Circuit Breaker ──────────────────────────────────────────────

interface CircuitBreakerState {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const FAILURE_THRESHOLD = 3; // Number of failures before opening circuit
const COOLDOWN_MS = 60000; // 1 minute cooldown

function checkCircuit(providerName: string): boolean {
    const breaker = circuitBreakers.get(providerName);
    if (!breaker) return true; // Allowed

    if (breaker.state === 'OPEN') {
        if (Date.now() - breaker.lastFailureTime > COOLDOWN_MS) {
            breaker.state = 'HALF_OPEN';
            return true;
        }
        return false;
    }
    return true;
}

function recordFailure(providerName: string, statusCode?: number) {
    // Only trip circuit for rate limits (429) and server errors (5xx)
    if (statusCode && statusCode !== 429 && (statusCode < 500 || statusCode > 599)) {
        return;
    }

    let breaker = circuitBreakers.get(providerName);
    if (!breaker) {
        breaker = { failures: 0, lastFailureTime: 0, state: 'CLOSED' };
        circuitBreakers.set(providerName, breaker);
    }
    
    breaker.failures += 1;
    breaker.lastFailureTime = Date.now();
    
    if (breaker.failures >= FAILURE_THRESHOLD && breaker.state === 'CLOSED') {
        breaker.state = 'OPEN';
        console.warn(`\x1b[31m[CIRCUIT BREAKER] 🔴 ${providerName} is now OPEN due to consecutive failures.\x1b[0m`);
    } else if (breaker.state === 'HALF_OPEN') {
        breaker.state = 'OPEN';
        console.warn(`\x1b[31m[CIRCUIT BREAKER] 🔴 ${providerName} returned to OPEN state.\x1b[0m`);
    }
}

/**
 * Read-only view of the circuit breakers, for diagnostics. Changes no state.
 */
export function getCircuitStates(): Record<string, { state: string; failures: number }> {
    const out: Record<string, { state: string; failures: number }> = {};
    for (const [name, b] of circuitBreakers.entries()) {
        out[name] = { state: b.state, failures: b.failures };
    }
    return out;
}

function recordSuccess(providerName: string) {
    const breaker = circuitBreakers.get(providerName);
    if (breaker && (breaker.state === 'HALF_OPEN' || breaker.failures > 0)) {
        breaker.state = 'CLOSED';
        breaker.failures = 0;
        console.log(`\x1b[32m[CIRCUIT BREAKER] 🟢 ${providerName} is now CLOSED and healthy.\x1b[0m`);
    }
}

// ── Core Call Function ───────────────────────────────────────────

async function callProvider<T>(
    config: ProviderConfig,
    options: AICallOptions
): Promise<AIResponse<T>> {
    if (!checkCircuit(config.name)) {
        console.warn(`\x1b[33m[CIRCUIT BREAKER] 🚫 Skipping ${config.name} (Circuit OPEN)\x1b[0m`);
        return {
            success: false,
            error: `Circuit breaker OPEN for ${config.name}`,
            provider: config.name,
            model: config.model,
            latency_ms: 0,
        };
    }

    const startTime = Date.now();

    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    // Inject Dual Timezone Anchoring if provided
    if (options.clientDate && options.clientTimezone) {
        messages.push({ 
            role: 'system', 
            content: `CRITICAL CONTEXT: The user's EXACT current local time on their device is ${options.clientDate} (Timezone: ${options.clientTimezone}). Always use this exact timestamp as the absolute anchor for "now", "today", "tomorrow", etc.` 
        });
    }

    if (options.messages && options.messages.length > 0) {
        messages.push(...options.messages);
    }
    messages.push({ role: 'user', content: options.prompt });

    const body: any = {
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1500,
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
            const error = new Error(`${config.name} API ${response.status}: ${errorText.slice(0, 200)}`);
            (error as any).status = response.status;
            throw error;
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const latencyMs = Date.now() - startTime;

        if (!rawContent) {
            throw new Error(`${config.name} returned empty response`);
        }

        recordSuccess(config.name);
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
        
        console.error(`\x1b[31m[AI ✗]\x1b[0m ${config.name}/${config.model} failed:`, error.message);
        
        if (error.name === 'AbortError') {
            recordFailure(config.name, 504); // Treat timeout as Gateway Timeout
        } else if (error.status) {
            recordFailure(config.name, error.status);
        } else if (error.message.includes('fetch')) {
            recordFailure(config.name, 503); // Treat network errors as unavailable
        }

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
    const totalStartTime = Date.now();
    const MAX_TOTAL_TIME = options.timeout ?? 55000;
    const MAX_PROVIDER_TIME = 15000; // Strict 15s limit per provider to prevent Vercel 504 timeouts

    const getRemainingTime = () => Math.max(0, MAX_TOTAL_TIME - (Date.now() - totalStartTime));

    // ── GROQ-ONLY MODE ───────────────────────────────────────────────
    // Strictly Groq Llama 3.3 70B, given the FULL remaining budget so a long
    // generation can finish instead of being cut at 15s and falling through.
    // No NVIDIA / Gemini / OpenRouter fallback. Hard fail with a clean error.
    if (options.groqOnly) {
        if (!process.env.GROQ_API_KEY) {
            return { success: false, error: 'GROQ_API_KEY not configured', provider: 'groq', model: GROQ_MODEL_LARGE, latency_ms: 0 };
        }
        const provider = getGroqConfig(GROQ_MODEL_LARGE);
        console.log(`\x1b[36m[AI ✨]\x1b[0m Groq-only mode → ${provider.model} (full ${getRemainingTime()}ms budget)...`);
        const result = await callProvider<T>(provider, { ...options, timeout: getRemainingTime() });
        if (result.success) return result;
        return {
            success: false,
            error: result.error || 'Groq 70B unavailable',
            provider: 'groq',
            model: provider.model,
            latency_ms: Date.now() - totalStartTime,
        };
    }

    // Weekly-review / batch engine: Gemini → Groq → OpenRouter.
    // Kept separate from the coach engine on purpose — a once-a-week batch job
    // must not compete with the real-time coach for providers or rate limits.
    if (options.batchReview) {
        const batchChain: ProviderConfig[] = [];
        if (process.env.GEMINI_API_KEY) batchChain.push(getGeminiConfig('gemini-2.5-flash'));
        if (process.env.GROQ_API_KEY) batchChain.push(getGroqConfig(GROQ_MODEL_LARGE));
        if (process.env.OPENROUTER_API_KEY) {
            batchChain.push(getOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'));
        }

        let lastBatch: AIResponse<T> | null = null;
        for (const provider of batchChain) {
            const remaining = getRemainingTime();
            if (remaining < 3000) break;
            console.log(`\x1b[35m[AI 📋]\x1b[0m Batch review trying ${provider.name}/${provider.model}...`);
            const result = await callProvider<T>(provider, {
                ...options,
                timeout: Math.min(MAX_PROVIDER_TIME, remaining),
            });
            lastBatch = result;
            if (result.success) return result;
        }
        return (
            lastBatch ?? {
                success: false,
                error: 'All batch review providers failed',
                provider: 'gemini',
                model: 'none',
                latency_ms: Date.now() - totalStartTime,
            }
        );
    }

    // Coach/Calendar dedicated engine:
    //   Groq → OpenRouter → Gemini → NVIDIA primary → NVIDIA tertiary
    //
    // Ordered by OBSERVED latency, not by intent. NVIDIA used to sit above
    // Gemini, which was harmless only while its models 410'd in 40ms. Once the
    // model IDs were corrected it became valid-but-slow, and two 15s NVIDIA
    // attempts ate 30s of a 40s budget before Gemini was ever tried — so a
    // healthy provider was starved by a slow one. Benchmarked on a realistic
    // ~1.5k-token prompt: groq 0.58s, gemini ~1s, nvidia 7.2s.
    if (options.useNvidia) {
        const nvidiaModel = tier === 'fast' ? NVIDIA_MODEL_SMALL : NVIDIA_MODEL_LARGE;
        const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
        const useGemini    = !!process.env.GEMINI_API_KEY;
        const useTertiary  = !!process.env.NVIDIA_API_KEY_TERTIARY;

        const nvidiaChain: ProviderConfig[] = [];
        
        if (options.strictNvidia) {
            nvidiaChain.push(getNvidiaConfig(nvidiaModel, process.env.CALENDAR_NVIDIA_API_KEY));
            if (useTertiary) nvidiaChain.push(getNvidiaConfig(nvidiaModel, process.env.NVIDIA_API_KEY_TERTIARY));
        } else {
            nvidiaChain.push(getGroqConfig(tier === 'fast' ? GROQ_MODEL_SMALL : GROQ_MODEL_LARGE));
            if (useOpenRouter && !options.skipOpenRouter) {
                nvidiaChain.push(getOpenRouterConfig(
                    tier === 'fast' ? 'openai/gpt-4o-mini' : 'meta-llama/llama-3.3-70b-instruct'
                ));
            }
            // Gemini ahead of NVIDIA: same providers, ordered so the slow one
            // cannot consume the budget the fast one needs.
            if (useGemini) nvidiaChain.push(getGeminiConfig('gemini-2.5-flash'));
            nvidiaChain.push(getNvidiaConfig(nvidiaModel, process.env.CALENDAR_NVIDIA_API_KEY));
            if (useTertiary) nvidiaChain.push(getNvidiaConfig(nvidiaModel, process.env.NVIDIA_API_KEY_TERTIARY));
        }

        for (const provider of nvidiaChain) {
            const remaining = getRemainingTime();
            if (remaining < 3000) break;
            console.log(`\x1b[36m[AI ✨]\x1b[0m Coach engine trying ${provider.name}/${provider.model}...`);
            const providerTimeout = options.strictNvidia ? remaining : Math.min(MAX_PROVIDER_TIME, remaining);
            const result = await callProvider<T>(provider, { ...options, timeout: providerTimeout });
            if (result.success) return result;
        }

        return { success: false, error: 'All coach providers failed', provider: 'groq', model: 'none', latency_ms: Date.now() - totalStartTime };
    }

    const chain = getProviderChain(options);
    let lastResult: AIResponse<T> | null = null;

    for (const provider of chain) {
        const remaining = getRemainingTime();
        if (remaining < 3000) break;
        console.log(`\x1b[33m[AI →]\x1b[0m Trying ${provider.name}/${provider.model}...`);
        const providerTimeout = Math.min(MAX_PROVIDER_TIME, remaining);
        const result = await callProvider<T>(provider, { ...options, timeout: providerTimeout });
        lastResult = result;
        if (result.success) return result;
    }

    return lastResult ?? { success: false, error: 'All providers failed', provider: 'groq', model: 'none', latency_ms: Date.now() - totalStartTime };
}
