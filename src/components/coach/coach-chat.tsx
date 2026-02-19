'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Sparkles, RotateCcw, Zap, Brain, Coffee, MessageCircle } from 'lucide-react';
import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { OptionCard } from '@/components/coach/option-card';

interface CoachChatProps {
    onClose?: () => void;
}

const QUICK_ACTIONS = [
    { label: 'Plan my day', icon: Zap },
    { label: "I'm tired", icon: Coffee },
    { label: 'Lighten today', icon: Brain },
];

export function CoachChat({ onClose }: CoachChatProps) {
    const { messages, isLoading, sendMessage, applyOption, undoByToken } = useCoach();
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || isLoading) return;
        setInput('');
        await sendMessage(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-5 border-b border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/50 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center border border-[var(--color-primary)]/20">
                        <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                    </div>
                    <div>
                        <span className="font-semibold text-sm">Chief of Staff</span>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                            <span className="text-[10px] text-[var(--text-tertiary)]">Online</span>
                        </div>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)] transition-colors"
                    >
                        <X className="w-4 h-4 text-[var(--text-secondary)]" />
                    </button>
                )}
            </div>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-6 opacity-60">
                        <Sparkles className="w-10 h-10 text-[var(--color-primary)]" />
                        <p className="text-sm text-[var(--text-secondary)] text-center max-w-[220px]">
                            Tell me what you need. I'll propose real schedule changes.
                        </p>
                        {/* Quick Actions */}
                        <div className="flex flex-wrap gap-2 justify-center">
                            {QUICK_ACTIONS.map(action => (
                                <button
                                    key={action.label}
                                    onClick={() => sendMessage(action.label)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                        bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                        hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]
                                        text-[var(--text-secondary)] transition-all"
                                >
                                    <action.icon className="w-3 h-3" />
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <AnimatePresence mode="popLayout">
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {msg.role === 'user' ? (
                                <UserBubble content={msg.content} />
                            ) : (
                                <AssistantMessage
                                    msg={msg}
                                    onApply={(optionId) => applyOption(msg.id, optionId)}
                                    onUndo={(token) => undoByToken(token)}
                                />
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Thinking Indicator */}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 px-4 py-2.5"
                    >
                        <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                                <div
                                    key={i}
                                    className="w-2 h-2 rounded-full bg-[var(--color-primary)]"
                                    style={{
                                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`
                                    }}
                                />
                            ))}
                        </div>
                        <span className="text-xs text-[var(--text-tertiary)]">Analyzing...</span>
                    </motion.div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/30">
                <div className="flex items-center gap-2 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2 focus-within:border-[var(--color-primary)] focus-within:ring-1 focus-within:ring-[var(--color-primary)]/20 transition-all">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="What do you need?"
                        className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-2 rounded-lg bg-[var(--color-primary)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition-all"
                    >
                        <Send className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Sub-Components ---

function UserBubble({ content }: { content: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/20 text-sm text-[var(--text-primary)]">
                {content}
            </div>
        </div>
    );
}

function AssistantMessage({
    msg,
    onApply,
    onUndo
}: {
    msg: CoachMessage;
    onApply: (optionId: string) => void;
    onUndo: (token: string) => void;
}) {
    return (
        <div className="space-y-3">
            {/* Mode Badge */}
            {msg.mode && msg.mode !== 'propose' && (
                <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${msg.mode === 'ask' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' :
                            msg.mode === 'refuse' ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' :
                                msg.mode === 'execute' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                                    'bg-[var(--glass-bg)] text-[var(--text-tertiary)]'
                        }`}>
                        {msg.mode}
                    </span>
                </div>
            )}

            {/* Summary Text */}
            <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">{msg.content}</p>
                </div>
            </div>

            {/* Question UI (ask mode) */}
            {msg.question && (
                <QuestionBlock question={msg.question} onAnswer={(ans) => {
                    // Send the answer as a follow-up message
                    const { sendMessage } = useCoach.getState();
                    sendMessage(ans);
                }} />
            )}

            {/* Refusal UI (refuse mode) */}
            {msg.refusal && (
                <div className="ml-8 p-3 rounded-xl bg-[var(--color-error)]/5 border border-[var(--color-error)]/10">
                    <p className="text-xs text-[var(--color-error)]">{msg.refusal.reason}</p>
                    {msg.refusal.next_best && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                            Try: <span className="text-[var(--text-primary)]">{msg.refusal.next_best}</span>
                        </p>
                    )}
                </div>
            )}

            {/* Options */}
            {msg.options && msg.options.length > 0 && (
                <div className="ml-8 space-y-2">
                    {msg.options.map((option) => (
                        <OptionCard
                            key={option.id}
                            option={option}
                            isApplying={msg.isApplying}
                            isApplied={msg.appliedOptionId === option.id}
                            onApply={() => onApply(option.id)}
                        />
                    ))}

                    {/* Undo Button (after apply) */}
                    {msg.undoToken && msg.appliedOptionId && (
                        <button
                            onClick={() => onUndo(msg.undoToken!)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                                bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                hover:bg-[var(--glass-bg-hover)] transition-all"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Undo
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function QuestionBlock({
    question,
    onAnswer
}: {
    question: { prompt: string; type: string; choices?: string[] };
    onAnswer: (answer: string) => void;
}) {
    const [textInput, setTextInput] = useState('');

    return (
        <div className="ml-8 p-3 rounded-xl bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/10 space-y-2">
            <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3 h-3 text-[var(--color-warning)]" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-warning)]">Question</span>
            </div>
            <p className="text-sm text-[var(--text-primary)]">{question.prompt}</p>

            {question.type === 'choice' && question.choices && (
                <div className="flex flex-wrap gap-2">
                    {question.choices.map((choice) => (
                        <button
                            key={choice}
                            onClick={() => onAnswer(choice)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg
                                bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]
                                text-[var(--text-primary)] transition-all"
                        >
                            {choice}
                        </button>
                    ))}
                </div>
            )}

            {question.type === 'confirm' && (
                <div className="flex gap-2">
                    <button onClick={() => onAnswer('Yes')} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all">
                        Yes
                    </button>
                    <button onClick={() => onAnswer('No')} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] transition-all">
                        No
                    </button>
                </div>
            )}

            {question.type === 'text' && (
                <div className="flex gap-2">
                    <input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && textInput.trim()) {
                                onAnswer(textInput.trim());
                                setTextInput('');
                            }
                        }}
                        placeholder="Type your answer..."
                        className="flex-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--color-primary)]"
                    />
                    <button
                        onClick={() => {
                            if (textInput.trim()) {
                                onAnswer(textInput.trim());
                                setTextInput('');
                            }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all"
                    >
                        <Send className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
}
