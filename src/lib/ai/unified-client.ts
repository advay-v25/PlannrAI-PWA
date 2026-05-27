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
    useNvidia?: boolean; // Use dedicated CALENDAR_NVIDIA_API_KEY for Coach & Calendar
    userId?: string; // Optional user ID for logging/auditing
}

export interface AIResponse<T = any> {
    success: boolean;
    data?: T;
    raw?: string;
    error?: string;
    provider: 'openrouter' | 'groq' | 'nvidia';
    model: string;
    latency_ms: number;
    tokens_used?: number;
}

// ── Provider Config ──────────────────────────────────────────────

interface ProviderConfig {
    name: 'openrouter' | 'groq' | 'nvidia';
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
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://plannrai.in',
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
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://plannrai.in',
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
            'Authorization': `Bearer ${process.env.GROQ_BACKUP_KEY || process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        }),
        supportsResponseFormat: true,
    };
}

function getNvidiaConfig(model: string): ProviderConfig {
    return {
        name: 'nvidia',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        model,
        getHeaders: () => ({
            'Authorization': `Bearer ${process.env.CALENDAR_NVIDIA_API_KEY || process.env.NVIDIA_API_KEY}`,
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

    if (options.useNvidia) {
        // Force NVIDIA endpoints for coach and calendar operations
        const nvidiaModel = tier === 'smart' ? 'meta/llama-3.1-70b-instruct' : 'meta/llama-3.1-8b-instruct';
        return [
            getNvidiaConfig(nvidiaModel),
            getCalendarOpenRouterConfig(nvidiaModel) // fallback
        ];
    }

    const getPrimaryOpenRouterConfig = getOpenRouterConfig;

    switch (tier) {
        case 'smart':
            return [
                getGroqConfig('llama-3.3-70b-versatile'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'),
            ];
        case 'fast':
            return [
                getGroqConfig('llama-3.1-8b-instant'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.1-8b-instruct'),
            ];
        case 'creative':
            return [
                getGroqConfig('llama-3.3-70b-versatile'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.3-70b-instruct'),
            ];
        default:
            return [
                getGroqConfig('llama-3.1-8b-instant'),
                getPrimaryOpenRouterConfig('meta-llama/llama-3.1-8b-instruct'),
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

    const getRemainingTime = () => Math.max(5000, MAX_TOTAL_TIME - (Date.now() - totalStartTime));

    // Calendar-dedicated key: bypass normal provider chain and use Nvidia
    // IMPORTANT: Nvidia often hangs. We enforce a strict 12-second timeout.
    // If it fails or times out, we instantly fall back to the user's Groq backup API key.
    if (options.useNvidia) {
        const nvidiaModel = tier === 'fast' ? 'meta/llama-3.1-8b-instruct' : 'meta/llama-3.1-70b-instruct';
        console.log(`\x1b[36m[AI ✨]\x1b[0m Using Nvidia API (${nvidiaModel}) for Generation...`);
        const calendarProvider = getNvidiaConfig(nvidiaModel);
        
        // Strict 12s timeout for Nvidia to leave plenty of Vercel execution time for Groq
        const nvidiaTimeout = Math.min(getRemainingTime(), 20000); 
        
        const result = await callProvider<T>(calendarProvider, { ...options, timeout: nvidiaTimeout });
        if (result.success) return result;
        
        // Fall back to Groq Llama 3.3 70B if Nvidia fails and time remains
        const remaining = getRemainingTime();
        if (remaining > 5000) {
            console.log('\x1b[33m[AI →]\x1b[0m Nvidia key failed/timed out, falling back to Groq backup...');
            const groqFallback = getGroqConfig('llama-3.3-70b-versatile');
            const groqResult = await callProvider<T>(groqFallback, { ...options, timeout: Math.min(remaining, 15000) });
            if (groqResult.success) return groqResult;
            
            // 3rd layer of redundancy: Emergency GPT-4o-Mini via OpenRouter if Groq also fails (e.g. rate limits)
            const emergencyRemaining = getRemainingTime();
            if (emergencyRemaining > 5000) {
                console.log('\x1b[35m[AI ALERT]\x1b[0m Nvidia & Groq failed. Trying OpenRouter Emergency (GPT-4o-Mini)...');
                const emergencyProvider = getOpenRouterConfig('openai/gpt-4o-mini');
                return callProvider<T>(emergencyProvider, { ...options, timeout: emergencyRemaining });
            }
            return groqResult;
        }
        return result;
    }

    const [primary, fallback] = getProviderChain(options);

    // Try primary
    const primaryResult = await callProvider<T>(primary, { ...options, timeout: getRemainingTime() });
    if (primaryResult.success) {
        return primaryResult;
    }

    // Fallback
    const remainingAfterPrimary = getRemainingTime();
    if (remainingAfterPrimary > 10000) {
        console.log(`\x1b[33m[AI →]\x1b[0m Falling back to ${fallback.name}...`);
        const fallbackResult = await callProvider<T>(fallback, { ...options, timeout: remainingAfterPrimary });
        if (fallbackResult.success) {
            return fallbackResult;
        }

        // Emergency Fallback: GPT-4o-Mini (Cheap & highly reliable)
        const remainingAfterFallback = getRemainingTime();
        if (remainingAfterFallback > 5000) {
            console.log(`\x1b[35m[AI ALERT]\x1b[0m Both providers failed. Trying emergency fallback (GPT-4o-Mini)...`);
            const emergencyProvider = getOpenRouterConfig('openai/gpt-4o-mini');
            const emergencyResult = await callProvider<T>(emergencyProvider, { ...options, timeout: remainingAfterFallback });
            if (emergencyResult.success) {
                return emergencyResult;
            }
            return emergencyResult;
        }
        return fallbackResult;
    }

    // All failed or no time left
    return primaryResult;
}
