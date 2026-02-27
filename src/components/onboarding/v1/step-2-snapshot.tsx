'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Send, CheckCircle2, Bot } from 'lucide-react';
// @ts-ignore
import { useChat } from 'ai/react';

export function Step2Snapshot() {
    const { data, updateData } = useOnboardingStore();
    const bottomRef = useRef<HTMLDivElement>(null);
    const [snapshotComplete, setSnapshotComplete] = useState(false);

    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: '/api/onboarding/conversation',
        body: {
            step: 'snapshot',
            userName: data.full_name,
            timezone: data.timezone,
        },
        initialMessages: [
            {
                id: '1',
                role: 'assistant',
                content: `Operator ${data.full_name || 'recognized'}. I need to map your absolute boundaries. Tell me about your rigid schedule. When do you sleep? How many meals a day? Any non-negotiable commitments like a 9-to-5 job or school?`
            }
        ],
        onFinish: (message: any) => {
            try {
                // The server will send a functional tool call or JSON payload in the response if extraction is 100% confident
                // For simplicity in the UI, if the AI says "EXTRACTION_COMPLETE", we parse the data.
                if (message.content.includes('EXTRACTION_COMPLETE')) {
                    const jsonMatch = message.content.match(/```json\\n([\\s\\S]*?)\\n```/);
                    if (jsonMatch) {
                        const extracted = JSON.parse(jsonMatch[1]);
                        console.log("Extracted boundaries:", extracted);

                        updateData({
                            sleep_start: extracted.sleep_time,
                            sleep_end: extracted.wake_time,
                            wind_down_mins: parseInt(extracted.wind_down_start) ? 60 : 45, // roughly
                            commitments: extracted.anchors || [],
                            meals_per_day: Object.keys(extracted.meals || {}).length || 3,
                            meal_windows: extracted.meals || {},
                        });
                        setSnapshotComplete(true);
                    }
                }
            } catch (e) {
                console.error("Failed to parse extraction", e);
            }
        }
    });

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    return (
        <div className="flex flex-col h-full w-full max-w-2xl mx-auto">
            <div className="flex-1 overflow-y-auto space-y-4 p-4 min-h-[400px] pb-24 scrollbar-hide">
                {messages.map((m: any) => {
                    const isAi = m.role === 'assistant';
                    // Hide the ugly JSON extraction marker from the user
                    if (m.content.includes('EXTRACTION_COMPLETE')) return null;

                    return (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex \${isAi ? 'justify-start' : 'justify-end'}`}
                        >
                            <div className={`flex max-w-[85%] \${isAi ? 'flex-row' : 'flex-row-reverse'} gap-3 items-end`}>
                                {isAi && (
                                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0 border border-[var(--color-primary)]/40 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.2)]">
                                        <Bot size={16} className="text-[var(--color-primary)]" />
                                    </div>
                                )}
                                <div className={`px-4 py-3 rounded-2xl text-sm md:text-base \${
                    isAi
                        ? 'bg-[var(--glass-surface)] border border-[var(--glass-border)] text-white/90 rounded-bl-sm'
                        : 'bg-[var(--color-primary)] text-black font-medium border border-[var(--color-primary)]/50 rounded-br-sm'
                }`}>
                                    {m.content}
                                </div>
                            </div>
                        </motion.div >
                    );
                })}
                {
                    isLoading && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                            <div className="flex flex-row gap-3 items-end">
                                <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0 border border-[var(--color-primary)]/40">
                                    <Bot size={16} className="text-[var(--color-primary)] animate-pulse" />
                                </div>
                                <div className="px-4 py-3 rounded-2xl bg-[var(--glass-surface)] border border-[var(--glass-border)] rounded-bl-sm flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </motion.div>
                    )
                }
                <div ref={bottomRef} />
            </div >

            <div className="relative pt-4 w-full">
                {snapshotComplete ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-[var(--color-glass)] border border-[var(--color-green)] text-[var(--color-green)] py-4 rounded-xl flex items-center justify-center gap-3 font-mono text-sm uppercase tracking-wider shadow-[0_0_15px_rgba(0,255,0,0.1)]"
                    >
                        <CheckCircle2 size={18} />
                        Boundaries Locked. Proceed.
                    </motion.div>
                ) : (
                    <form onSubmit={handleSubmit} className="relative flex items-center w-full">
                        <Input
                            value={input}
                            onChange={handleInputChange}
                            placeholder="Type your schedule details..."
                            className="bg-[var(--glass-surface)] border-[var(--glass-border)] focus:border-[var(--color-primary)] text-white pr-14 py-6 rounded-xl w-full font-mono text-sm placeholder:text-gray-600"
                            disabled={isLoading}
                            autoFocus
                        />
                        <GlassButton
                            type="submit"
                            variant="primary"
                            disabled={isLoading || !input.trim()}
                            className="absolute right-2 px-3 py-2 rounded-lg"
                        >
                            <Send size={18} />
                        </GlassButton>
                    </form>
                )}
            </div>
        </div >
    );
}
