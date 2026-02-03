'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useCoachStore, useUserStore, useGoalsStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Sparkles, Send, User, Loader2, Zap } from 'lucide-react';

const QUICK_PROMPTS = [
    "I'm feeling overwhelmed today",
    "Help me prioritize",
    "I missed my goals yesterday",
    "What should I focus on?",
];

export default function CoachPage() {
    const supabase = createClient();
    const { profile } = useUserStore();
    const { goals } = useGoalsStore();
    const { messages, isLoading, addMessage, setLoading } = useCoachStore();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (messageText?: string) => {
        const text = messageText || input.trim();
        if (!text || isLoading) return;

        // Add user message
        addMessage({ role: 'user', content: text });
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('/api/coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    context: {
                        lowEnergyMode: profile?.low_energy_mode,
                        goals: goals.map((g) => ({ title: g.title, category: g.category, importance: g.importance })),
                    },
                }),
            });

            const data = await response.json();

            if (data.response) {
                addMessage({
                    role: 'assistant',
                    content: data.response.formatted || data.response,
                    response: data.response.structured,
                });
            }
        } catch (error) {
            addMessage({
                role: 'assistant',
                content: "I apologize, but I'm having trouble responding right now. Please try again in a moment.",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-180px)] md:h-[calc(100vh-100px)]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/20 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-[var(--color-primary)]" />
                </div>
                <div>
                    <h1 className="text-xl font-bold">Your Strategist</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">
                        I&apos;m here to help, not to judge
                    </p>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {messages.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-[var(--color-text-muted)] mb-6">
                            What&apos;s on your mind?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {QUICK_PROMPTS.map((prompt) => (
                                <GlassButton
                                    key={prompt}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSend(prompt)}
                                    className="text-sm"
                                >
                                    {prompt}
                                </GlassButton>
                            ))}
                        </div>
                    </div>
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
                                    <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
                                        <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                                    </div>
                                )}

                                <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
                                    {message.role === 'user' ? (
                                        <GlassCard padding="sm" className="bg-[var(--color-primary)]/20">
                                            <p className="text-sm">{message.content}</p>
                                        </GlassCard>
                                    ) : message.response ? (
                                        <CoachResponse response={message.response} onReply={handleSend} />
                                    ) : (
                                        <GlassCard padding="sm">
                                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                        </GlassCard>
                                    )}
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

                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-3"
                    >
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                        </div>
                        <GlassCard padding="sm" className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                            <span className="text-sm text-[var(--color-text-muted)]">Thinking...</span>
                        </GlassCard>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything..."
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                />
                <GlassButton
                    variant="primary"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                >
                    <Send className="w-4 h-4" />
                </GlassButton>
            </div>
        </div>
    );
}

// Structured Coach Response Component
function CoachResponse({ response, onReply }: {
    response: {
        facts: string;
        interpretation: string;
        options: string[];
        permissionCheck: string;
        suggestedAction?: { type: string; params: any };
    };
    onReply: (text: string) => void;
}) {
    const supabase = createClient();
    const [actionStatus, setActionStatus] = useState<'idle' | 'executing' | 'done'>('idle');

    const handleExecuteAction = async () => {
        if (!response.suggestedAction || actionStatus !== 'idle') return;

        setActionStatus('executing');
        try {
            const { type, params } = response.suggestedAction;

            if (type === 'create_goal') {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await supabase.from('goals').insert({
                        user_id: user.id,
                        title: params.title,
                        category: params.category || 'personal',
                        importance: params.importance || 'medium',
                        status: 'active'
                    });
                }
            } else if (type === 'schedule_block') {
                console.log("Scheduling block:", params);
            }

            setTimeout(() => {
                setActionStatus('done');
                onReply(`I've executed the action: ${type === 'create_goal' ? 'Goal Created' : 'Scheduled'}`);
            }, 1000);

        } catch (e) {
            console.error(e);
            setActionStatus('idle');
        }
    };

    return (
        <GlassCard padding="md" className="space-y-4 border-l-2 border-[var(--color-primary)]">
            {/* Facts */}
            <div>
                <p className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                    Reality
                </p>
                <p className="text-sm leading-relaxed">{response.facts}</p>
            </div>

            {/* Interpretation */}
            <div>
                <p className="text-[10px] font-bold text-[var(--color-accent-mind)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-mind)]" />
                    Insight
                </p>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed italic">
                    "{response.interpretation}"
                </p>
            </div>

            {/* Options */}
            <div>
                <p className="text-[10px] font-bold text-[var(--color-accent-body)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-body)]" />
                    Strategy
                </p>
                <div className="space-y-2">
                    {response.options.map((option, i) => (
                        <div
                            key={i}
                            onClick={() => onReply(option)}
                            className="flex items-start gap-3 p-2 rounded-lg bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-colors cursor-pointer group"
                        >
                            <span className="w-5 h-5 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-[10px] font-mono flex-shrink-0 group-hover:border-[var(--color-primary)] group-hover:text-[var(--color-primary)] transition-all">
                                {String.fromCharCode(65 + i)}
                            </span>
                            <p className="text-sm group-hover:text-[var(--color-text-primary)] transition-colors">{option}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Suggested System Action */}
            {response.suggestedAction && (
                <div className="mt-3 p-3 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
                    <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-[var(--color-primary)]" />
                        <span className="text-xs font-bold text-[var(--color-primary)] uppercase">Recommended Action</span>
                    </div>
                    <p className="text-sm mb-3">
                        {response.suggestedAction.type === 'create_goal'
                            ? `Add Goal: "${response.suggestedAction.params.title}"`
                            : `Schedule: "${response.suggestedAction.params.title}"`
                        }
                    </p>
                    <GlassButton
                        size="sm"
                        variant="primary"
                        className="w-full"
                        onClick={handleExecuteAction}
                        disabled={actionStatus !== 'idle'}
                    >
                        {actionStatus === 'executing' ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing...</>
                        ) : actionStatus === 'done' ? (
                            <><Sparkles className="w-4 h-4 mr-2" /> Done</>
                        ) : (
                            "Do it for me"
                        )}
                    </GlassButton>
                </div>
            )}

            {/* Permission Check */}
            <div className="pt-3 border-t border-[var(--glass-border)] mt-2">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {response.permissionCheck}
                </p>
                <div className="flex gap-2 mt-2">
                    <GlassButton
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => onReply("Not right now, thanks.")}
                    >
                        Maybe later
                    </GlassButton>
                    <GlassButton
                        size="sm"
                        variant="primary"
                        className="text-xs"
                        onClick={() => onReply("Yes, please proceed.")}
                    >
                        Yes, please
                    </GlassButton>
                </div>
            </div>
        </GlassCard>
    );
}
