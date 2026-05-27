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
    name: 'openrouter' | 'groq' | 'nvidia' | 'gemini' | 'cerebras';
    url: string;
    model: string;
    getHeaders: () => Record<string, string>;
    supportsResponseFormat: boolean;
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

// Smart = complex reasoning (coach, goals, weekly review) → Groq primary (70B)
// Fast = simple extraction (brain dump, habits, briefings) → Groq primary (8B)
function getProviderChain(options: AICallOptions): [ProviderConfig, ProviderConfig] {
    const tier = options.model || 'fast';

    if (options.useNvidia) {
        // Force Groq endpoints for coach and calendar operations because the new key is fast and paid
        const groqModel = tier === 'smart' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
        return [
            getGroqConfig(groqModel),
            getGeminiConfig('gemini-3.5-flash') // fallback
        ];
    }

    switch (tier) {
        case 'smart':
        case 'creative':
            return [
                getGroqConfig('llama-3.3-70b-versatile'),
                getNvidiaConfig('meta/llama-3.1-70b-instruct'),
            ];
        case 'fast':
        default:
            return [
                getGroqConfig('llama-3.1-8b-instant'),
                getGeminiConfig('gemini-3.5-flash'),
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

    const getRemainingTime = () => Math.max(5000, MAX_TOTAL_TIME - (Date.now() - totalStartTime));

    // Coach/Calendar dedicated engine (labeled useNvidia for legacy reasons, but routes to Groq)
    if (options.useNvidia) {
        const groqModel = tier === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';
        console.log(`\x1b[36m[AI ✨]\x1b[0m Using Groq API (${groqModel}) for Generation...`);
        const calendarProvider = getGroqConfig(groqModel);
        
        const groqTimeout = Math.min(getRemainingTime(), 55000); 
        
        const result = await callProvider<T>(calendarProvider, { ...options, timeout: groqTimeout });
        if (result.success) return result;
        
        // 2nd layer of redundancy: Ultimate Gemini Backup
        const ultimateRemaining = getRemainingTime();
        if (ultimateRemaining > 5000) {
            console.log('\x1b[36m[AI ULTIMATE]\x1b[0m Groq failed. Falling back to Gemini 3.5 Flash...');
            const geminiProvider = getGeminiConfig('gemini-3.5-flash');
            return callProvider<T>(geminiProvider, { ...options, timeout: ultimateRemaining });
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

        // Emergency Fallback: Gemini 3.5 Flash (Huge context & highly reliable)
        const remainingAfterFallback = getRemainingTime();
        if (remainingAfterFallback > 5000) {
            console.log(`\x1b[35m[AI ALERT]\x1b[0m Both providers failed. Trying emergency fallback (Gemini 3.5 Flash)...`);
            const emergencyProvider = getGeminiConfig('gemini-3.5-flash');
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
