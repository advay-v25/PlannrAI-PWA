'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send, Sparkles, RotateCcw, Brain, ArrowRight, Check, Loader2,
    MessageCircle, Zap, Eye, Clock, Target, TrendingUp
} from 'lucide-react';
import { useCoach, CoachMessage } from '@/hooks/use-coach';

export function CoachChat() {
    const {
        messages, isLoading, suggestedActions,
        sendMessage, applyOption, undoByToken, loadProactiveInsight
    } = useCoach();
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    // Load proactive insight on mount
    useEffect(() => {
        loadProactiveInsight();
    }, []);

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

    // Dynamic quick actions — from AI suggestions or defaults
    const quickActions = suggestedActions.length > 0
        ? suggestedActions
        : ['What should I focus on?', "Lighten my afternoon", 'Am I on track this week?'];

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="h-14 flex items-center gap-3 px-5 border-b border-white/5 bg-black/40 backdrop-blur-xl shrink-0">
                <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-black" />
                </div>
                <div>
                    <span className="font-bold text-sm text-white tracking-tight">Donna</span>
                    <div className="text-[10px] text-white/30 font-medium">Chief of Staff • Performance Coach</div>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
                {messages.length === 0 && !isLoading && (
                    <EmptyState quickActions={quickActions} onAction={sendMessage} />
                )}

                <AnimatePresence mode="popLayout">
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
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
                {isLoading && <ThinkingIndicator />}
            </div>

            {/* Smart Chips */}
            <AnimatePresence>
                {quickActions.length > 0 && !isLoading && messages.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-2 flex gap-2 flex-wrap"
                    >
                        {quickActions.map((action, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessage(action)}
                                className="px-3 py-1.5 rounded-full text-[11px] font-medium
                                    bg-white/5 border border-white/10 text-white/50
                                    hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]
                                    transition-all"
                            >
                                {action}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input */}
            <div className="p-3 border-t border-white/5 bg-black/30 shrink-0">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2
                    focus-within:border-violet-500/40 focus-within:bg-white/[0.08] transition-all">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Tell Donna what you need..."
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-2 rounded-lg bg-violet-500 text-white disabled:opacity-20 disabled:cursor-not-allowed
                            hover:brightness-110 active:scale-95 transition-all"
                    >
                        <Send className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Empty State ---
function EmptyState({ quickActions, onAction }: { quickActions: string[], onAction: (text: string) => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/15 to-cyan-500/15 flex items-center justify-center border border-white/10">
                    <Brain className="w-7 h-7 text-violet-400" />
                </div>
                <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center"
                >
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </motion.div>
            </div>

            <div className="text-center space-y-1">
                <h3 className="text-sm font-bold text-white">Donna is ready</h3>
                <p className="text-xs text-white/30 max-w-[240px]">
                    I know your schedule, goals, and energy.
                    I'll propose real changes, not just advice.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {quickActions.map((action, i) => (
                    <button
                        key={i}
                        onClick={() => onAction(action)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
                            bg-white/5 border border-white/10 text-white/50
                            hover:bg-violet-500/10 hover:border-violet-500/20 hover:text-violet-300
                            transition-all"
                    >
                        <Zap className="w-3 h-3" />
                        {action}
                    </button>
                ))}
            </div>
        </div>
    );
}

// --- Thinking Indicator ---
function ThinkingIndicator() {
    const steps = ['Scanning schedule...', 'Checking energy & capacity...', 'Finding optimal moves...'];
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentStep(prev => (prev + 1) % steps.length);
        }, 1800);
        return () => clearInterval(timer);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 px-1"
        >
            <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/60">Thinking</span>
                </div>
                <AnimatePresence mode="wait">
                    <motion.p
                        key={currentStep}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 5 }}
                        className="text-xs text-white/40"
                    >
                        {steps[currentStep]}
                    </motion.p>
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// --- User Bubble ---
function UserBubble({ content }: { content: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-violet-500/15 border border-violet-500/20 text-sm text-white">
                {content}
            </div>
        </div>
    );
}

// --- Assistant Message ---
function AssistantMessage({
    msg, onApply, onUndo
}: {
    msg: CoachMessage;
    onApply: (optionId: string) => void;
    onUndo: (token: string) => void;
}) {
    return (
        <div className="space-y-3">
            {/* Thinking Steps (Collapsed by default, expandable) */}
            {msg.thinking && msg.thinking.length > 0 && (
                <ThinkingSteps steps={msg.thinking} />
            )}

            {/* Context Used */}
            {msg.contextUsed && msg.contextUsed.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap ml-9">
                    <Eye className="w-3 h-3 text-white/20 shrink-0" />
                    {msg.contextUsed.map((ctx, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-white/30">
                            {ctx}
                        </span>
                    ))}
                </div>
            )}

            {/* Main Message */}
            <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/15 to-cyan-500/15 flex items-center justify-center shrink-0 mt-0.5 border border-white/5">
                    <Sparkles className="w-3 h-3 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/90 leading-relaxed">{msg.content}</p>
                </div>
            </div>

            {/* Question UI */}
            {msg.question && (
                <QuestionBlock question={msg.question} onAnswer={(ans) => {
                    const { sendMessage } = useCoach.getState();
                    sendMessage(ans);
                }} />
            )}

            {/* Refusal */}
            {msg.refusal && (
                <div className="ml-9 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                    <p className="text-xs text-red-400">{msg.refusal.reason}</p>
                    {msg.refusal.next_best && (
                        <p className="text-xs text-white/40 mt-1">
                            Try: <span className="text-white/60">{msg.refusal.next_best}</span>
                        </p>
                    )}
                </div>
            )}

            {/* Options */}
            {msg.options && msg.options.length > 0 && (
                <div className="ml-9 space-y-2">
                    {msg.options.map((option) => (
                        <OptionCard
                            key={option.id}
                            option={option}
                            isApplying={msg.isApplying}
                            isApplied={msg.appliedOptionId === option.id}
                            onApply={() => onApply(option.id)}
                        />
                    ))}

                    {/* Undo */}
                    {msg.undoToken && msg.appliedOptionId && (
                        <button
                            onClick={() => onUndo(msg.undoToken!)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                text-white/40 hover:text-white bg-white/5 border border-white/5
                                hover:bg-orange-500/10 hover:border-orange-500/20 hover:text-orange-400
                                transition-all"
                        >
                            <RotateCcw className="w-3 h-3" /> Undo this change
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// --- Thinking Steps ---
function ThinkingSteps({ steps }: { steps: string[] }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <button
            onClick={() => setExpanded(!expanded)}
            className="ml-9 flex flex-col gap-1 text-left w-full"
        >
            <div className="flex items-center gap-1.5">
                <Brain className="w-3 h-3 text-violet-400/40" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/40">
                    {expanded ? 'Reasoning' : `${steps.length} reasoning steps`}
                </span>
            </div>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-1 pl-1"
                    >
                        {steps.map((step, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px] text-white/30">
                                <span className="text-violet-400/40 font-mono shrink-0">{i + 1}.</span>
                                <span>{step}</span>
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </button>
    );
}

// --- Option Card ---
function OptionCard({ option, isApplying, isApplied, onApply }: {
    option: any;
    isApplying?: boolean;
    isApplied?: boolean;
    onApply: () => void;
}) {
    const opCount = option.patch?.ops?.length || 0;

    const effortColors: Record<string, string> = {
        low: 'text-emerald-400 bg-emerald-500/10',
        medium: 'text-amber-400 bg-amber-500/10',
        high: 'text-red-400 bg-red-500/10'
    };

    return (
        <motion.div
            layout
            className={`group relative rounded-xl border p-3 transition-all cursor-pointer ${isApplied
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                }`}
            onClick={() => !isApplying && !isApplied && onApply()}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${isApplied ? 'text-emerald-400' : 'text-white'
                        }`}>
                        {option.title}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5 leading-normal">{option.impact}</p>
                    {option.tradeoff && (
                        <p className="text-xs text-orange-400/70 mt-0.5 leading-normal flex items-center gap-1">
                            <Zap className="w-3 h-3 flex-shrink-0" />
                            {option.tradeoff}
                        </p>
                    )}

                    {/* Impact Badges */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {option.effort && !isApplied && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${effortColors[option.effort] || ''}`}>
                                {option.effort} effort
                            </span>
                        )}
                        {option.time_impact_mins && !isApplied && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-cyan-400 bg-cyan-500/10">
                                <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                                {option.time_impact_mins > 0 ? '+' : ''}{option.time_impact_mins}m
                            </span>
                        )}
                        {opCount > 0 && !isApplied && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                                {opCount} change{opCount !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>

                <div className="shrink-0 mt-0.5">
                    {isApplying ? (
                        <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    ) : isApplied ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center
                            group-hover:border-violet-500/30 group-hover:bg-violet-500/10 transition-all">
                            <ArrowRight className="w-3 h-3 text-white/30 group-hover:text-violet-400 transition-colors" />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// --- Question Block ---
function QuestionBlock({ question, onAnswer }: {
    question: { prompt: string; type: string; choices?: string[] };
    onAnswer: (answer: string) => void;
}) {
    const [textInput, setTextInput] = useState('');

    return (
        <div className="ml-9 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-2">
            <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/60">Clarification needed</span>
            </div>
            <p className="text-sm text-white/80">{question.prompt}</p>

            {question.type === 'choice' && question.choices && (
                <div className="flex flex-wrap gap-2">
                    {question.choices.map((choice) => (
                        <button
                            key={choice}
                            onClick={() => onAnswer(choice)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg
                                bg-white/5 border border-white/10 text-white/70
                                hover:bg-violet-500/10 hover:border-violet-500/20 hover:text-violet-300
                                transition-all"
                        >
                            {choice}
                        </button>
                    ))}
                </div>
            )}

            {question.type === 'confirm' && (
                <div className="flex gap-2">
                    <button onClick={() => onAnswer('Yes')} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/20 transition-all">
                        Yes
                    </button>
                    <button onClick={() => onAnswer('No')} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 transition-all">
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
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-violet-500/30"
                    />
                    <button
                        onClick={() => {
                            if (textInput.trim()) {
                                onAnswer(textInput.trim());
                                setTextInput('');
                            }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all"
                    >
                        <Send className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
}
