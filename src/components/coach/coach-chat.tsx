'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { OptionCard } from './option-card';

interface CoachChatProps {
    onClose: () => void;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    options?: any[];
    timestamp: string;
}

export function CoachChat({ onClose }: CoachChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [appliedOptionId, setAppliedOptionId] = useState<string | null>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [lastUndoToken, setLastUndoToken] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: input.trim(),
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setAppliedOptionId(null);

        try {
            const res = await fetch('/api/coach/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    conversation_id: conversationId,
                }),
            });

            const data = await res.json();

            if (data.conversation_id) {
                setConversationId(data.conversation_id);
            }

            const assistantMessage: Message = {
                id: data.response?.id || `asst_${Date.now()}`,
                role: 'assistant',
                content: data.response?.summary || data.response?.acknowledgment?.message || 'I understand.',
                options: data.response?.options,
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('[CoachChat] Error:', error);
            setMessages(prev => [...prev, {
                id: `err_${Date.now()}`,
                role: 'assistant',
                content: 'Sorry, I had trouble processing that. Please try again.',
                timestamp: new Date().toISOString(),
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const applyOption = async (optionId: string, patch: any) => {
        if (!conversationId || isApplying) return;
        setIsApplying(true);

        try {
            const res = await fetch('/api/coach/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    option_id: optionId,
                    patch,
                }),
            });

            const data = await res.json();
            if (data.ok || data.success) {
                setAppliedOptionId(optionId);
                setLastUndoToken(data.undo_token);
            }
        } catch (error) {
            console.error('[CoachChat] Apply error:', error);
        } finally {
            setIsApplying(false);
        }
    };

    const undoLast = async () => {
        if (!lastUndoToken) return;
        try {
            await fetch('/api/coach/undo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ undo_token: lastUndoToken }),
            });
            setAppliedOptionId(null);
            setLastUndoToken(null);
        } catch (error) {
            console.error('[CoachChat] Undo error:', error);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--glass-border)]">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-mind)] flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold">Donna</h3>
                        <p className="text-[10px] text-[var(--text-tertiary)]">AI Coach</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--glass-bg-hover)] transition-colors">
                    <X className="w-4 h-4 text-[var(--text-tertiary)]" />
                </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center py-12 space-y-3">
                        <div className="w-12 h-12 mx-auto rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-[var(--color-primary)]" />
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">Hey! I'm Donna, your AI coach.</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Ask me to adjust your schedule, add tasks, or just vent!</p>
                        <div className="flex flex-wrap justify-center gap-2 pt-2">
                            {['Reorganize today', "I'm overwhelmed", 'Add 30min reading'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => { setInput(s); }}
                                    className="px-3 py-1.5 text-xs rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all text-[var(--text-secondary)]"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] ${
                            msg.role === 'user'
                                ? 'bg-[var(--color-primary)] text-white rounded-2xl rounded-br-md px-4 py-2.5'
                                : 'space-y-3'
                        }`}>
                            {msg.role === 'assistant' && (
                                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl rounded-bl-md px-4 py-2.5">
                                    <p className="text-sm text-[var(--text-primary)]">{msg.content}</p>
                                </div>
                            )}
                            {msg.role === 'user' && (
                                <p className="text-sm">{msg.content}</p>
                            )}

                            {/* Options */}
                            {msg.options && msg.options.length > 0 && (
                                <div className="space-y-2 mt-2">
                                    {msg.options.map((opt: any) => (
                                        <OptionCard
                                            key={opt.id}
                                            option={opt}
                                            isApplying={isApplying}
                                            isApplied={appliedOptionId === opt.id}
                                            onApply={() => applyOption(opt.id, opt.patch)}
                                        />
                                    ))}

                                    {lastUndoToken && appliedOptionId && (
                                        <button
                                            onClick={undoLast}
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
                                        >
                                            <RotateCcw className="w-3 h-3" /> Undo
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                                <span className="text-xs text-[var(--text-tertiary)]">Donna is thinking...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[var(--glass-border)]">
                <div className="flex items-center gap-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder="Ask Donna..."
                        className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] 
                            placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-primary)]/30 focus:ring-1 focus:ring-[var(--color-primary)]/10
                            outline-none transition-all text-[var(--text-primary)]"
                        disabled={isLoading}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!input.trim() || isLoading}
                        className="p-2.5 rounded-xl bg-[var(--color-primary)] text-white hover:brightness-110 active:scale-[0.96] disabled:opacity-30 transition-all"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
