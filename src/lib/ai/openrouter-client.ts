/**
 * 🚀 PLANNRAI — OPENROUTER CLIENT
 * This client replaces Groq for high-throughput AI operations.
 */

export interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenRouterConfig {
    model: string;
    temperature?: number;
    maxTokens?: number;
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";

export async function openRouterChat(
    messages: OpenRouterMessage[],
    config: OpenRouterConfig
) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not configured in environment variables.");
    }

    // Map internal model names to OpenRouter specific names if needed
    let model = config.model;
    if (model === "llama-3.3-70b-versatile" || model === "llama3-70b-8192") {
        model = "meta-llama/llama-3.3-70b-instruct";
    }

    const startTime = Date.now();

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://plannrai.com", // OpenRouter requires this for rankings
                "X-Title": "PlannrAI Performance Engine"
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: config.temperature ?? 0.4,
                max_tokens: config.maxTokens ?? 4000,
                response_format: { type: "json_object" } // Mandate JSON for our schemas
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OpenRouter] API Error (${response.status}):`, errorText);
            throw new Error(`OpenRouter API failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const latencyMs = Date.now() - startTime;

        console.log(`[OpenRouter] SUCCESS model=${model} latency=${latencyMs}ms`);
        console.log(`[OpenRouter] finish_reason=${data.choices?.[0]?.finish_reason}, usage:`, data.usage);

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error("OpenRouter returned an empty response.");
        }

        return {
            content,
            usage: data.usage,
            model: data.model,
            latency_ms: latencyMs
        };

    } catch (error: any) {
        console.error("[OpenRouter] Chat Completion Failed:", error);
        throw error;
    }
}
