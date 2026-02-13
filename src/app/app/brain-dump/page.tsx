'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Brain, Send, User, Loader2, Sparkles, CheckCircle2, ArrowUp } from 'lucide-react';

import { BrainDumpTriage } from '@/components/brain-dump/brain-dump-triage';
import { apiClient } from '@/lib/api-client';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    triageData?: any; // New schema data
    timestamp: Date;
}

const QUICK_PROMPTS = [
    "I can't focus today",
    "My head is all over the place",
    "I'm overwhelmed with everything",
    "I don't know what to prioritize",
    "I'm stressed about work",
    "I need to vent for a second",
];

export default function BrainDumpPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

        // Add user message
        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: messageText,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Call Unified AI Gateway
            const response = await apiClient.post<any>('/api/ai/execute', {
                channel: 'brain_dump',
                input: messageText,
                context: {}, // Context is built on server
                limits: { max_options: 3 }
            });

            // Handle Response
            const data = response.data || response;

            const assistantMessage: Message = {
                id: `donna-${Date.now()}`,
                role: 'assistant',
                content: data.strategy.summary || "I've analyzed that for you.",
                triageData: data,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMessage]);

        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: "I couldn't process that brain dump. Please try again.",
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-180px)] md:h-[calc(100vh-100px)]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-mind)]/20 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-[var(--color-accent-mind)]" />
                </div>
                <div>
                    <h1 className="text-xl font-bold">Donna</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">
                        Your mind declutter assistant
                    </p>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
                {messages.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-8"
                    >
                        <div className="w-16 h-16 rounded-full bg-[var(--color-accent-mind)]/20 flex items-center justify-center mx-auto mb-4">
                            <Brain className="w-8 h-8 text-[var(--color-accent-mind)]" />
                        </div>
                        <h2 className="text-lg font-semibold mb-2">Hey there.</h2>
                        <p className="text-[var(--color-text-muted)] mb-6 max-w-sm mx-auto">
                            I'm Donna. Think of me as your brilliant friend who also happens to be really good at cutting through the noise. What's on your mind?
                        </p>
                        <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                            {QUICK_PROMPTS.map((prompt) => (
                                <GlassButton
                                    key={prompt}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => sendMessage(prompt)}
                                    className="text-sm text-left justify-start"
                                >
                                    {prompt}
                                </GlassButton>
                            ))}
                        </div>
                    </motion.div>
                ) : (
                    <AnimatePresence initial={false}>
                        {messages.map((message) => (
                            <motion.div
                                key={message.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {message.role === 'assistant' && (
                                    <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-mind)]/20 flex items-center justify-center flex-shrink-0">
                                        <Brain className="w-4 h-4 text-[var(--color-accent-mind)]" />
                                    </div>
                                )}

                                <div className={`max-w-[90%] md:max-w-[70%] ${message.role === 'user' ? 'order-first' : ''}`}>
                                    {message.triageData ? (
                                        <BrainDumpTriage
                                            data={message.triageData}
                                            onComplete={() => { }}
                                            onCancel={() => { }}
                                        />
                                    ) : (
                                        <GlassCard
                                            padding="sm"
                                            className={message.role === 'user'
                                                ? 'bg-[var(--color-primary)]/20'
                                                : 'border-l-2 border-[var(--color-accent-mind)]'
                                            }
                                        >
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                                        </GlassCard>
                                    )}
                                    <span className="text-[10px] text-[var(--text-tertiary)] px-2 mt-1 block">
                                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {message.role === 'user' && (
                                    <div className="w-8 h-8 rounded-lg bg-[var(--glass-bg)] flex items-center justify-center flex-shrink-0">
                                        <User className="w-4 h-4 text-[var(--color-text-muted)]" />
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}

                {/* Loading State */}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-3"
                    >
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-mind)]/20 flex items-center justify-center">
                            <Brain className="w-4 h-4 text-[var(--color-accent-mind)]" />
                        </div>
                        <GlassCard padding="sm" className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--color-accent-mind)]" />
                            <span className="text-xs text-[var(--text-tertiary)]">Analyzing intent...</span>
                        </GlassCard>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0">
                <GlassCard padding="sm" className="backdrop-blur-xl">
                    <div className="flex items-end gap-2">
                        <div className="flex-1 relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="What's on your mind? (I'll sort it for you)"
                                disabled={isLoading}
                                className="w-full bg-transparent border-none outline-none resize-none max-h-[120px] min-h-[44px] py-3 px-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] custom-scrollbar"
                                rows={1}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                                }}
                            />
                        </div>
                        <GlassButton
                            variant="primary"
                            size="sm"
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isLoading}
                            className={`h-[44px] w-[44px] rounded-xl transition-all duration-300 ${input.trim() ? 'opacity-100 scale-100' : 'opacity-50 scale-95'
                                }`}
                        >
                            <ArrowUp className="w-5 h-5" />
                        </GlassButton>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
