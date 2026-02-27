'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Send, CheckCircle2, Bot } from 'lucide-react';
import { useChat } from '@ai-sdk/react';

export function Step2Snapshot() {
    const { data, updateData } = useOnboardingStore();
    const bottomRef = useRef<HTMLDivElement>(null);
    const [snapshotComplete, setSnapshotComplete] = useState(false);
    const [input, setInput] = useState('');

    const { messages, sendMessage, status } = useChat({
        api: '/api/onboarding/conversation',
        body: {
            step: 'snapshot',
            userName: data.full_name,
        },
        initialMessages: [
            {
                id: '1',
                role: 'assistant',
                content: `Eyes on you, ${data.full_name || 'Partner'}. I need the raw reality of your current stack. When do you wake up, when do you sleep, and what are your fixed non-negotiables?`
            }
        ]
    } as any);

    const isLoading = status === 'loading' || status === 'streaming';

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const currentInput = input;
        setInput('');
        await sendMessage({ text: currentInput });
    };

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }

        // Logic for extraction completion
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.content.includes('EXTRACTION_COMPLETE')) {
            try {
                const jsonMatch = lastMessage.content.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    const extracted = JSON.parse(jsonMatch[1]);
                    updateData({
                        wake_time: extracted.wake_time,
                        sleep_time: extracted.sleep_time,
                        wind_down_mins: extracted.wind_down_start ? 30 : 0, // mock
                        commitments: extracted.anchors || []
                    });
                    setSnapshotComplete(true);
                }
            } catch (e) {
                console.error("Failed to parse extraction", e);
            }
        }
    }, [messages, updateData]);

    return (
        <div className="flex flex-col h-full w-full max-w-2xl mx-auto">
            <div className="flex-1 overflow-y-auto space-y-4 p-4 min-h-[300px] pb-24 scrollbar-hide">
                {messages.map((m: any) => {
                    const isAi = m.role === 'assistant';
                    if (m.content.includes('EXTRACTION_COMPLETE')) return null;

                    return (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${isAi ? 'justify-start' : 'justify-end'}`}
                        >
                            <div className={`flex max-w-[85%] ${isAi ? 'flex-row' : 'flex-row-reverse'} gap-3 items-end`}>
                                {isAi && (
                                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0 border border-[var(--color-primary)]/40 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.2)]">
                                        <Bot size={16} className="text-[var(--color-primary)]" />
                                    </div>
                                )}
                                <div className={`px-4 py-3 rounded-2xl text-sm md:text-base ${isAi
                                        ? 'bg-[var(--glass-surface)] border border-[var(--glass-border)] text-white/90 rounded-bl-sm'
                                        : 'bg-[var(--color-primary)] text-black font-medium border border-[var(--color-primary)]/50 rounded-br-sm'
                                    }`}>
                                    {m.content}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
                {isLoading && (
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
                )}
                <div ref={bottomRef} />
            </div>

            <div className="relative pt-4 w-full">
                {snapshotComplete ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-[var(--color-glass)] border border-[var(--color-primary)] text-[var(--color-primary)] py-4 rounded-xl flex items-center justify-center gap-3 font-mono text-sm uppercase tracking-wider shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.1)]"
                    >
                        <CheckCircle2 size={18} />
                        Snapshot Authenticated.
                    </motion.div>
                ) : (
                    <form onSubmit={handleFormSubmit} className="relative flex items-center w-full">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="e.g. Wake at 7am, Sleep at 11pm, Team meeting 9-10am daily..."
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
        </div>
    );
}
