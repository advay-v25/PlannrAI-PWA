'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';

import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CoachOption } from '@/types/coach-v4';

import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';
import { usePremiumCalendar } from '@/components/calendar/premium-calendar-styles';
import { motion, AnimatePresence } from 'framer-motion';

interface CoachChatProps {
    onCalendarUpdate?: () => void;
    onClose?: () => void;
}

// ─── Inline option card shown directly in the chat thread ───────────────────
function InlineOptionCard({
    option,
    onSelect,
    disabled,
}: {
    option: CoachOption;
    onSelect: () => void;
    disabled: boolean;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            onClick={() => !disabled && onSelect()}
            className={`group relative p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                option.recommended
                    ? 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 hover:border-orange-500/50'
                    : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14]'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {option.recommended && (
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-500 mb-1.5 block">
                    ✦ Recommended
                </span>
            )}

            {/* Title — bold */}
            <p className="font-bold text-white/90 text-[14px] leading-snug mb-1">
                {option.title}
            </p>

            {/* Description — regular weight */}
            {option.description && (
                <p className="text-sm text-white/55 leading-relaxed">{option.description}</p>
            )}

            {/* Impact bullets */}
            {option.impact && (
                <p className="text-xs text-orange-400/80 mt-2 whitespace-pre-line leading-relaxed">
                    {option.impact}
                </p>
            )}

            {/* Tradeoff warning */}
            {option.tradeoff && (
                <div className={`mt-2 text-xs p-2.5 rounded-xl border ${
                    option.tradeoff.severity === 'warning'
                        ? 'bg-red-500/5 text-red-300/80 border-red-500/15'
                        : option.tradeoff.severity === 'caution'
                        ? 'bg-yellow-500/5 text-yellow-300/80 border-yellow-500/15'
                        : 'bg-white/[0.03] text-white/40 border-white/[0.06]'
                }`}>
                    <span className="font-bold">Note: </span>{option.tradeoff.warning}
                </div>
            )}

            {/* Scenario analysis expandable */}
            {option.scenario_analysis && expanded && (
                <div className="mt-2 text-xs text-white/50 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] leading-relaxed">
                    {option.scenario_analysis}
                </div>
            )}

            <div className="mt-3 flex items-center gap-2">
                <button
                    onClick={e => { e.stopPropagation(); if (!disabled) onSelect(); }}
                    className={`px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-colors ${
                        option.recommended
                            ? 'bg-orange-500 text-white hover:bg-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                            : 'bg-white/10 text-white/80 hover:bg-white/[0.16]'
                    }`}
                >
                    Apply
                </button>
                {option.scenario_analysis && (
                    <button
                        onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest bg-white/[0.04] text-white/35 hover:text-white/60 transition-colors"
                    >
                        {expanded ? 'Hide' : 'Why?'}
                    </button>
                )}
            </div>
        </motion.div>
    );
}

export function CoachChat({ onCalendarUpdate, onClose }: CoachChatProps) {
    const { showToast } = useToast();
    const {
        messages,
        isLoading,
        error,
        minimalMode,
        canUndo,
        sendMessage,
        applyOption,
        undo,
        clearError,
        loadHistory,
        clearConversation
    } = useCoach();

    useEffect(() => {
        if (messages.length === 0) {
            loadHistory();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const [input, setInput] = useState('');
    const [pendingOption, setPendingOption] = useState<CoachOption | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [isApplyingChanges, setIsApplyingChanges] = useState(false);

    // History panel
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [pastConversations, setPastConversations] = useState<any[]>([]);
    const [isLoadingHistoryList, setIsLoadingHistoryList] = useState(false);

    const handleOpenHistory = async () => {
        setIsHistoryOpen(!isHistoryOpen);
        if (!isHistoryOpen && pastConversations.length === 0) {
            setIsLoadingHistoryList(true);
            try {
                const res = await apiClient.get('/api/coach/conversations') as any;
                if (res?.success) setPastConversations(res.conversations || []);
            } catch (err) {
                console.error('Failed to fetch conversations', err);
            } finally {
                setIsLoadingHistoryList(false);
            }
        }
    };

    const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            const res = await apiClient.delete(`/api/coach/conversations?id=${id}`) as any;
            if (res?.success) {
                setPastConversations(prev => prev.filter(c => c.id !== id));
                showToast('Chat deleted', 'success');
            }
        } catch (err) {
            console.error('Failed to delete conversation', err);
            showToast('Failed to delete chat', 'error');
        }
    };

    // Cycling loading stages — shown in italics
    const [loadingStage, setLoadingStage] = useState(0);
    const stages = [
        'Reading your schedule…',
        'Analysing goals and blocks…',
        'Finding free slots…',
        'Finding optimal placement…',
        'Preparing your options…',
    ];

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isLoading) {
            interval = setInterval(() => {
                setLoadingStage(prev => (prev + 1) % stages.length);
            }, 3000);
        } else {
            setLoadingStage(0);
        }
        return () => clearInterval(interval);
    }, [isLoading, stages.length]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        const message = input;
        setInput('');
        await sendMessage(message);
    };

    const handleQuickChip = (text: string) => {
        if (isLoading) return;
        sendMessage(text);
    };

    const handleOptionSelect = (option: CoachOption) => {
        if (option.tradeoff || option.patch.requires_confirmation) {
            setPendingOption(option);
            setShowPreview(true);
        } else {
            handleApply(option);
        }
    };

    const handleApply = async (option: CoachOption) => {
        const parentMessage = messages.find(m => m.options?.some(o => o.id === option.id));
        if (!parentMessage) return;

        setShowPreview(false);
        setPendingOption(null);
        setIsApplyingChanges(true);

        try {
            const result = await applyOption(parentMessage.id, option.id);
            if (result) {
                const appliedOption = typeof result === 'object' ? result : option;
                const ops = (appliedOption.patch as any)?.operations || [];

                let isReplan = false;
                const blockIdsToAnimate: string[] = [];

                ops.forEach((op: any) => {
                    if (op.type === 'replan_week') {
                        isReplan = true;
                    } else if (op.type === 'move_block' || op.type === 'update_block') {
                        if (op.payload?.id) blockIdsToAnimate.push(op.payload.id);
                    }
                });

                if (isReplan) {
                    usePremiumCalendar.getState().setIsAnimating(true);
                } else if (blockIdsToAnimate.length > 0) {
                    blockIdsToAnimate.forEach(id => {
                        usePremiumCalendar.getState().addAnimatingBlock(id, 1000);
                    });
                }

                onCalendarUpdate?.();

                if (isReplan) {
                    setTimeout(() => {
                        usePremiumCalendar.getState().setIsAnimating(false);
                    }, 2500);
                }
            }
        } finally {
            setIsApplyingChanges(false);
        }
    };

    const handleUndo = async () => {
        const success = await undo();
        if (success) onCalendarUpdate?.();
    };

    const handleNewChat = () => {
        clearConversation();
        setIsHistoryOpen(false);
    };

    return (
        <div className="flex flex-col h-full relative overflow-hidden bg-transparent">

            {/* ── Header ── */}
            <div className="z-20 px-5 py-4 flex justify-between items-center border-b border-white/[0.06] bg-[#0a0a0b]/80 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                        <span className="text-white text-sm">⚡</span>
                    </div>
                    <div>
                        <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                            Donna
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-scifi-blink" />
                        </span>
                        <span className="text-[10px] text-white/35 uppercase tracking-wider block">
                            Strategic Mode · Calendar · Goals · Tasks
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* History */}
                    <button
                        onClick={handleOpenHistory}
                        title="Chat history"
                        className={`p-2 rounded-xl transition-colors ${
                            isHistoryOpen
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'text-white/35 hover:bg-white/[0.06] hover:text-white'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>

                    {/* New chat */}
                    <button
                        onClick={handleNewChat}
                        title="New conversation"
                        className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors text-white/35 hover:text-white"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── History overlay ── */}
            <AnimatePresence>
                {isHistoryOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute inset-y-[57px] right-0 w-72 z-30 bg-[#0d0d0e]/97 backdrop-blur-xl border-l border-white/[0.06] flex flex-col shadow-2xl"
                    >
                        <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.05]">
                            <span className="text-xs font-bold text-white uppercase tracking-widest">Past Chats</span>
                            <button
                                onClick={() => setIsHistoryOpen(false)}
                                className="text-white/35 hover:text-white transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
                            {isLoadingHistoryList ? (
                                <p className="text-xs text-white/30 text-center py-6 animate-pulse">Loading…</p>
                            ) : pastConversations.length === 0 ? (
                                <p className="text-xs text-white/25 text-center py-6">No past conversations.</p>
                            ) : (
                                pastConversations.map(conv => (
                                    <div key={conv.id} className="relative group/item flex items-center">
                                        <button
                                            onClick={() => { setIsHistoryOpen(false); loadHistory(conv.id); }}
                                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] transition-all flex flex-col gap-0.5"
                                        >
                                            <span className="text-[13px] font-medium text-white/80 group-hover/item:text-orange-400 transition-colors pr-7 truncate">
                                                {conv.primary_topic || 'Strategy Session'}
                                            </span>
                                            <span className="text-[11px] text-white/30">
                                                {conv.last_message_at
                                                    ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })
                                                    : '—'}
                                            </span>
                                        </button>
                                        <button
                                            onClick={e => handleDeleteChat(e, conv.id)}
                                            className="absolute right-2 p-1.5 rounded-lg text-white/15 opacity-0 group-hover/item:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                            title="Delete"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Error banner ── */}
            {error && (
                <div className="z-10 bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex justify-between items-center backdrop-blur-md animate-slide-up shrink-0">
                    <span className="text-xs text-red-400 font-medium">{error}</span>
                    <button onClick={clearError} className="text-red-400/50 hover:text-red-400 text-lg leading-none">×</button>
                </div>
            )}

            {/* ── Messages ── */}
            <div className="z-10 flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-hide">

                {/* Empty state */}
                {messages.length === 0 && !isLoading && (
                    <div className="text-center mt-12 animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500/50 mx-auto mb-6 flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                            <span className="text-white text-2xl">⚡️</span>
                        </div>
                        <p className="text-lg font-semibold text-white mb-2">How shall we architect today?</p>
                        <p className="text-xs text-white/35 max-w-[240px] mx-auto italic mb-8">
                            &quot;I&apos;m overwhelmed,&quot; or &quot;Protect my focus today.&quot;
                        </p>
                        <div className="flex flex-wrap justify-center gap-2 max-w-[320px] mx-auto">
                            {[
                                { label: "Fix today's schedule", emoji: "🔄" },
                                { label: "Reduce today's load", emoji: "😵‍💫" },
                                { label: "Review this week", emoji: "📈" },
                                { label: "Protect my goals", emoji: "🛡️" },
                            ].map(chip => (
                                <button
                                    key={chip.label}
                                    onClick={() => handleQuickChip(chip.label)}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-white/[0.03] border border-white/[0.06] rounded-full text-[13px] font-medium text-white/55 hover:text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/25 transition-all disabled:opacity-50"
                                >
                                    {chip.emoji} {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div key={message.id || index} className="space-y-3">
                        <CoachMessageBubble message={message} />

                        {/* ── Inline options — shown in chat thread ── */}
                        {message.role === 'assistant' &&
                            message.options &&
                            message.options.length > 0 &&
                            !message.selected_option_id &&
                            !message.isApplying && (
                            <div className="pl-2 space-y-2">
                                {message.options.map(opt => (
                                    <InlineOptionCard
                                        key={opt.id}
                                        option={opt}
                                        onSelect={() => handleOptionSelect(opt)}
                                        disabled={isLoading}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Applying indicator */}
                        {message.role === 'assistant' &&
                            message.options &&
                            message.options.length > 0 &&
                            message.isApplying && (
                            <div className="pl-2 animate-slide-up">
                                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex items-center gap-3 animate-pulse">
                                    <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                        <span className="text-[10px] text-yellow-400 animate-spin">⚡</span>
                                    </div>
                                    <span className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider">
                                        Applying Changes…
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Applied confirmation */}
                        {message.role === 'assistant' &&
                            message.selected_option_id &&
                            !message.isApplying && (
                            <div className="pl-2 animate-slide-up">
                                <div className="p-3 rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-5 h-5 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-[10px] text-white">✓</div>
                                        <div>
                                            <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase block">Applied</span>
                                            <span className="text-sm text-white/70">
                                                {message.options?.find(o => o.id === message.selected_option_id)?.title}
                                            </span>
                                        </div>
                                    </div>
                                    {message.undoToken && (
                                        <button
                                            onClick={e => { e.stopPropagation(); handleUndo(); }}
                                            disabled={isLoading}
                                            className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400 uppercase tracking-wider hover:bg-red-500/20 transition-all disabled:opacity-50"
                                        >
                                            ↩ Undo
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Suggested follow-up chips */}
                        {message.role === 'assistant' &&
                            message.suggestedActions &&
                            message.suggestedActions.length > 0 &&
                            !message.selected_option_id && (
                            <div className="flex flex-wrap gap-2 pl-2 animate-fade-in">
                                {message.suggestedActions.map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleQuickChip(action)}
                                        disabled={isLoading}
                                        className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.07] rounded-full text-[11px] text-white/40 hover:text-white hover:bg-orange-500/10 hover:border-orange-500/25 transition-all disabled:opacity-50"
                                    >
                                        {action}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {/* ── Loading indicator — italic stage text ── */}
                {isLoading && (
                    <div className="flex items-start gap-4 animate-fade-in pl-2">
                        <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
                            <div className="absolute inset-2 bg-gradient-to-tr from-purple-500 to-orange-400 rounded-full animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.8)]" />
                            <div className="absolute inset-0 border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                            <div className="absolute inset-0 border-[1.5px] border-b-orange-500 border-r-transparent border-t-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                        </div>
                        <div className="pt-1">
                            <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[260px]">
                                <div className="flex items-center gap-3">
                                    {/* Italic stage text */}
                                    <span className="text-[11px] text-white/55 font-mono tracking-wide italic">
                                        {stages[loadingStage]}
                                    </span>
                                    <div className="flex gap-1 shrink-0">
                                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(251,146,60,0.8)]" style={{ animationDelay: '0s' }} />
                                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(168,85,247,0.8)]" style={{ animationDelay: '0.2s' }} />
                                        <span className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(236,72,153,0.8)]" style={{ animationDelay: '0.4s' }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* ── Changes in progress toast ── */}
            {isApplyingChanges && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-primary)] text-white px-6 py-3 rounded-full shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.5)] flex items-center gap-3 animate-fade-in">
                    <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                    <span className="font-bold tracking-wide text-sm uppercase">Changes in Progress</span>
                </div>
            )}

            {/* ── Undo strip ── */}
            {canUndo && !isLoading && (
                <div className="z-10 px-8 py-3 border-t border-white/[0.05] bg-black/20 backdrop-blur-sm animate-fade-in flex justify-center shrink-0">
                    <button
                        onClick={handleUndo}
                        className="text-[10px] font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] uppercase tracking-widest flex items-center gap-2"
                    >
                        Revert Last Protocol ↩
                    </button>
                </div>
            )}

            {/* ── Input area ── */}
            <div className="z-10 flex flex-col border-t border-white/[0.05] bg-[#0a0a0b]/80 backdrop-blur-3xl pb-2 shrink-0">
                {/* Quick chips */}
                {!isLoading && (
                    <div className="px-5 pt-3 pb-2 overflow-x-auto scrollbar-hide">
                        <div className="flex gap-2 min-w-max">
                            {['Plan my day', 'What should I do next?', 'Replan my week', 'Show my progress'].map(chip => (
                                <button
                                    key={chip}
                                    onClick={() => handleQuickChip(chip)}
                                    className="px-4 py-2 rounded-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-[11px] font-bold text-white/40 hover:text-white transition-all whitespace-nowrap tracking-wide"
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input bar */}
                <form onSubmit={handleSubmit} className="px-5 py-3">
                    <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-[1.5rem] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all focus-within:border-orange-500/50 focus-within:bg-[#0a0a0b] focus-within:shadow-[0_0_40px_rgba(249,115,22,0.15)] group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-amber-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder={messages.length > 0 ? 'Message Donna…' : 'What do you want to accomplish?'}
                            disabled={isLoading}
                            className="flex-1 bg-transparent px-4 py-3.5 text-[15px] focus:outline-none placeholder:text-white/25 text-white font-medium relative z-10"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="w-12 h-12 bg-white/[0.03] hover:bg-gradient-to-tr hover:from-orange-500 hover:to-amber-500 rounded-[1.1rem] flex items-center justify-center transition-all text-white/40 hover:text-white disabled:opacity-30 disabled:hover:bg-white/[0.03] relative z-10"
                        >
                            <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>

            {/* ── Confirmation modal ── */}
            {showPreview && pendingOption && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                    <ConfirmationModal
                        option={pendingOption}
                        onConfirm={() => handleApply(pendingOption)}
                        onCancel={() => { setShowPreview(false); setPendingOption(null); }}
                        isLoading={isLoading}
                    />
                </div>
            )}
        </div>
    );
}
