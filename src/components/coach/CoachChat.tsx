'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { CoachOption } from '@/types/coach-v4';
import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';
import { usePremiumCalendar } from '@/components/calendar/premium-calendar-styles';
import { motion, AnimatePresence } from 'framer-motion';

interface CoachChatProps {
    onCalendarUpdate?: () => void;
    onClose?: () => void;
}

// ── Quick action bubbles shown on empty state ────────────────────────────────
const quickBubbles = [
    {
        label: "Reduce today's load",
        emoji: '😵‍💫',
        action: 'reduce_today_load' as const,
        description: 'Move low-priority blocks to later in the week',
    },
    {
        label: "Fix today's schedule",
        emoji: '🔄',
        action: 'fix_today_schedule' as const,
        description: 'Reschedule overdue blocks to open slots',
    },
];

// ── Inline option card with "Review & Execute" expand ───────────────────────
function InlineOptionCard({
    option,
    onSelect,
    disabled,
}: {
    option: CoachOption;
    onSelect: () => void;
    disabled: boolean;
}) {
    const [reviewOpen, setReviewOpen] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className={`group relative p-4 rounded-2xl border transition-all duration-200 ${
                option.recommended
                    ? 'border-orange-500/30 bg-orange-500/5'
                    : 'border-white/[0.07] bg-white/[0.03]'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {option.recommended && (
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-500 mb-1.5 block">
                    ✦ Recommended
                </span>
            )}

            <p className="font-bold text-white/90 text-[14px] leading-snug mb-1">{option.title}</p>

            {option.description && (
                <p className="text-sm text-white/55 leading-relaxed whitespace-pre-line">{option.description}</p>
            )}

            {option.impact && (
                <p className="text-xs text-orange-400/80 mt-2 whitespace-pre-line leading-relaxed">{option.impact}</p>
            )}

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

            <div className="mt-3 flex items-center gap-2">
                <button
                    onClick={e => { e.stopPropagation(); setReviewOpen(!reviewOpen); }}
                    disabled={disabled}
                    className={`px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-colors ${
                        option.recommended
                            ? 'bg-orange-500 text-white hover:bg-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                            : 'bg-white/10 text-white/80 hover:bg-white/[0.16]'
                    }`}
                >
                    {reviewOpen ? 'Hide Review' : 'Review & Execute'}
                </button>
                {option.scenario_analysis && (
                    <button
                        onClick={e => { e.stopPropagation(); setReviewOpen(!reviewOpen); }}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest bg-white/[0.04] text-white/35 hover:text-white/60 transition-colors"
                    >
                        Why?
                    </button>
                )}
            </div>

            <AnimatePresence>
                {reviewOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-3 overflow-hidden"
                    >
                        <div className="p-3 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
                            <p className="text-[11px] font-bold text-white/60 uppercase tracking-widest">
                                Changes Preview
                            </p>
                            <p className="text-sm text-white/75 whitespace-pre-line leading-relaxed">
                                {option.description}
                            </p>
                            {option.scenario_analysis && (
                                <p className="text-xs text-white/40 leading-relaxed">{option.scenario_analysis}</p>
                            )}
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    if (!disabled) { setReviewOpen(false); onSelect(); }
                                }}
                                disabled={disabled}
                                className="w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-widest bg-orange-500 text-white hover:bg-orange-400 transition-colors shadow-[0_0_20px_rgba(249,115,22,0.3)] disabled:opacity-50"
                            >
                                Apply Changes
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────
export function CoachChat({ onCalendarUpdate, onClose }: CoachChatProps) {
    const { showToast } = useToast();
    const {
        messages,
        isLoading,
        error,
        canUndo,
        sendMessage,
        applyOption,
        undo,
        clearError,
        loadHistory,
        clearConversation,
    } = useCoach();

    useEffect(() => {
        if (messages.length === 0) loadHistory();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [input, setInput] = useState('');
    const [pendingOption, setPendingOption] = useState<CoachOption | null>(null);
    const [pendingParentId, setPendingParentId] = useState<string>('');
    const [showPreview, setShowPreview] = useState(false);
    const [isApplyingChanges, setIsApplyingChanges] = useState(false);
    const [isQuickActionLoading, setIsQuickActionLoading] = useState(false);

    // Synthetic messages from quick-action endpoint (no server conversation needed)
    const [syntheticMessages, setSyntheticMessages] = useState<CoachMessage[]>([]);

    // Auto-scroll when either message source updates
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, syntheticMessages]);

    // Combined ordered display list
    const allMessages = [...messages, ...syntheticMessages].sort(
        (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
    );

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

    // Italic loading stages
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
        if (isLoading || isQuickActionLoading) {
            interval = setInterval(() => setLoadingStage(prev => (prev + 1) % stages.length), 3000);
        } else {
            setLoadingStage(0);
        }
        return () => clearInterval(interval);
    }, [isLoading, isQuickActionLoading, stages.length]);

    const showLoadingIndicator = isLoading || isQuickActionLoading;

    // ── Quick action handler (no AI, dedicated endpoint) ─────────────────────
    const handleQuickAction = async (action: 'reduce_today_load' | 'fix_today_schedule') => {
        if (isQuickActionLoading || isLoading) return;
        setIsQuickActionLoading(true);

        const labelMap: Record<string, string> = {
            reduce_today_load: "Reduce today's load",
            fix_today_schedule: "Fix today's schedule",
        };

        try {
            const raw = await apiClient.post('/api/coach/quick-action', { action }) as any;

            if (!raw.success) {
                showToast(raw.error || 'Something went wrong', 'error');
                return;
            }

            const { summary, ops } = raw;
            const assistantId = `assistant_${Date.now()}`;

            const option: CoachOption = {
                id: `quick_${action}_${Date.now()}`,
                title: labelMap[action],
                description: summary,
                impact: `${raw.meta?.moved || 0} block${(raw.meta?.moved || 0) !== 1 ? 's' : ''} rescheduled${raw.meta?.dropped ? `, ${raw.meta.dropped} dropped` : ''}`,
                patch: {
                    ops: ops.map((op: any) => {
                        if (op.type === 'move_block') {
                            return { op: 'move_event', event_id: op.block_id, title: op.title, to_start: op.new_start, to_end: op.new_end, date: op.new_date };
                        }
                        if (op.type === 'delete_block') {
                            return { op: 'delete_event', event_id: op.block_id, title: op.title };
                        }
                        return op;
                    }),
                    operations: ops, // passed to apply/route normalizer
                    undoable: true,
                    scope: 'week' as const,
                    reason: labelMap[action],
                    // false: the inline "Review & Execute" panel IS the confirmation step —
                    // no second modal needed
                    requires_confirmation: false,
                } as any,
                recommended: true,
            };

            setSyntheticMessages(prev => [
                ...prev,
                {
                    id: `user_${Date.now()}`,
                    role: 'user' as const,
                    content: labelMap[action],
                    timestamp: Date.now(),
                },
                {
                    id: assistantId,
                    role: 'assistant' as const,
                    content: summary,
                    options: ops.length > 0 ? [option] : undefined,
                    timestamp: Date.now() + 1,
                },
            ]);
        } catch (err: any) {
            showToast('Failed to process request', 'error');
            console.error('[QuickAction]', err);
        } finally {
            setIsQuickActionLoading(false);
        }
    };

    // ── Option select (handles both synthetic + real message options) ─────────
    const handleOptionSelect = async (option: CoachOption, parentMessageId: string) => {
        const isSynthetic = parentMessageId.startsWith('assistant_') || parentMessageId.startsWith('local_');

        if (option.tradeoff || option.patch.requires_confirmation) {
            setPendingOption(option);
            setPendingParentId(parentMessageId);
            setShowPreview(true);
            return;
        }

        await executeApply(option, parentMessageId, isSynthetic);
    };

    const executeApply = async (option: CoachOption, parentMessageId: string, isSynthetic: boolean) => {
        setIsApplyingChanges(true);

        if (isSynthetic) {
            try {
                const result = await apiClient.post('/api/coach/apply', {
                    conversation_id: null,
                    option_id: option.id,
                    patch: option.patch,
                }) as any;

                if (result.success || result.applied_operations > 0) {
                    setSyntheticMessages(prev => prev.map(m =>
                        m.id === parentMessageId
                            ? { ...m, selected_option_id: option.id, undoToken: result.undo_token }
                            : m
                    ));
                    onCalendarUpdate?.();
                    const moveOps = (option.patch as any).operations || [];
                    moveOps.forEach((op: any) => {
                        if (op.type === 'move_block' && op.block_id) {
                            usePremiumCalendar.getState().addAnimatingBlock(op.block_id, 1000);
                        }
                    });
                } else {
                    showToast(result.error || 'Failed to apply changes', 'error');
                }
            } catch {
                showToast('Failed to apply changes', 'error');
            } finally {
                setIsApplyingChanges(false);
            }
            return;
        }

        // Standard flow for AI-generated options
        const parentMessage = allMessages.find(m => m.id === parentMessageId);
        if (!parentMessage) { setIsApplyingChanges(false); return; }

        try {
            const result = await applyOption(parentMessage.id, option.id);
            if (result) {
                const appliedOption = typeof result === 'object' ? result : option;
                const ops = (appliedOption.patch as any)?.operations || [];
                let isReplan = false;
                const blockIdsToAnimate: string[] = [];
                ops.forEach((op: any) => {
                    if (op.type === 'replan_week') isReplan = true;
                    else if ((op.type === 'move_block' || op.type === 'update_block') && op.payload?.id) {
                        blockIdsToAnimate.push(op.payload.id);
                    }
                });
                if (isReplan) {
                    usePremiumCalendar.getState().setIsAnimating(true);
                    setTimeout(() => usePremiumCalendar.getState().setIsAnimating(false), 2500);
                } else {
                    blockIdsToAnimate.forEach(id => usePremiumCalendar.getState().addAnimatingBlock(id, 1000));
                }
                onCalendarUpdate?.();
            }
        } finally {
            setIsApplyingChanges(false);
        }
    };

    const handleUndo = async () => {
        const success = await undo();
        if (success) onCalendarUpdate?.();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        const msg = input;
        setInput('');
        await sendMessage(msg);
    };

    const handleNewChat = () => {
        clearConversation();
        setSyntheticMessages([]);
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

            {/* ── History slide-in panel ── */}
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
                            <button onClick={() => setIsHistoryOpen(false)} className="text-white/35 hover:text-white transition-colors">
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
                <div className="z-10 bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex justify-between items-center backdrop-blur-md shrink-0">
                    <span className="text-xs text-red-400 font-medium">{error}</span>
                    <button onClick={clearError} className="text-red-400/50 hover:text-red-400 text-lg leading-none">×</button>
                </div>
            )}

            {/* ── Messages ── */}
            <div className="z-10 flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-hide">

                {/* Empty state — 2 quick-action bubbles */}
                {allMessages.length === 0 && !showLoadingIndicator && (
                    <div className="flex flex-col items-center mt-10 animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500/50 mx-auto mb-5 flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                            <span className="text-white text-2xl">⚡️</span>
                        </div>
                        <p className="text-lg font-semibold text-white mb-1">How shall we architect today?</p>
                        <p className="text-xs text-white/35 italic mb-8">Or type anything below to start a conversation.</p>

                        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                            {quickBubbles.map(bubble => (
                                <button
                                    key={bubble.action}
                                    onClick={() => handleQuickAction(bubble.action)}
                                    disabled={showLoadingIndicator}
                                    className="flex-1 flex flex-col items-start gap-2 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:border-orange-500/25 hover:bg-orange-500/10 transition-all duration-200 text-left disabled:opacity-50 disabled:pointer-events-none group"
                                >
                                    <span className="text-2xl">{bubble.emoji}</span>
                                    <span className="font-semibold text-white/90 text-[15px] group-hover:text-orange-300 transition-colors">{bubble.label}</span>
                                    <span className="text-xs text-white/40">{bubble.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Message thread */}
                {allMessages.map((message, index) => (
                    <div key={message.id || index} className="space-y-3">
                        <CoachMessageBubble message={message} />

                        {/* Inline options */}
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
                                        onSelect={() => handleOptionSelect(opt, message.id || '')}
                                        disabled={isApplyingChanges || showLoadingIndicator}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Applying indicator */}
                        {message.role === 'assistant' &&
                            message.options &&
                            message.options.length > 0 &&
                            message.isApplying && (
                            <div className="pl-2">
                                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex items-center gap-3 animate-pulse">
                                    <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                        <span className="text-[10px] text-yellow-400 animate-spin">⚡</span>
                                    </div>
                                    <span className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider">Applying Changes…</span>
                                </div>
                            </div>
                        )}

                        {/* Applied confirmation */}
                        {message.role === 'assistant' &&
                            message.selected_option_id &&
                            !message.isApplying && (
                            <div className="pl-2">
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

                        {/* Suggested follow-ups */}
                        {message.role === 'assistant' &&
                            message.suggestedActions &&
                            message.suggestedActions.length > 0 &&
                            !message.selected_option_id && (
                            <div className="flex flex-wrap gap-2 pl-2">
                                {message.suggestedActions.map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(action)}
                                        disabled={showLoadingIndicator}
                                        className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.07] rounded-full text-[11px] text-white/40 hover:text-white hover:bg-orange-500/10 hover:border-orange-500/25 transition-all disabled:opacity-50"
                                    >
                                        {action}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading indicator — italic stage text */}
                {showLoadingIndicator && (
                    <div className="flex items-start gap-4 animate-fade-in pl-2">
                        <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
                            <div className="absolute inset-2 bg-gradient-to-tr from-purple-500 to-orange-400 rounded-full animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.8)]" />
                            <div className="absolute inset-0 border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                            <div className="absolute inset-0 border-[1.5px] border-b-orange-500 border-r-transparent border-t-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                        </div>
                        <div className="pt-1">
                            <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[260px]">
                                <div className="flex items-center gap-3">
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

            {/* Changes in progress toast */}
            {isApplyingChanges && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-primary)] text-white px-6 py-3 rounded-full shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.5)] flex items-center gap-3 animate-fade-in">
                    <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                    <span className="font-bold tracking-wide text-sm uppercase">Applying Changes</span>
                </div>
            )}

            {/* Undo strip */}
            {canUndo && !isLoading && (
                <div className="z-10 px-8 py-3 border-t border-white/[0.05] bg-black/20 backdrop-blur-sm flex justify-center shrink-0">
                    <button
                        onClick={handleUndo}
                        className="text-[10px] font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] uppercase tracking-widest flex items-center gap-2"
                    >
                        Revert Last Protocol ↩
                    </button>
                </div>
            )}

            {/* Input bar — no chip strip */}
            <div className="z-10 border-t border-white/[0.05] bg-[#0a0a0b]/80 backdrop-blur-3xl pb-2 shrink-0">
                <form onSubmit={handleSubmit} className="px-5 py-3">
                    <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-[1.5rem] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all focus-within:border-orange-500/50 focus-within:bg-[#0a0a0b] focus-within:shadow-[0_0_40px_rgba(249,115,22,0.15)] group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-amber-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder={allMessages.length > 0 ? 'Message Donna…' : 'Or type anything to start a conversation…'}
                            disabled={showLoadingIndicator}
                            className="flex-1 bg-transparent px-4 py-3.5 text-[15px] focus:outline-none placeholder:text-white/25 text-white font-medium relative z-10"
                        />
                        <button
                            type="submit"
                            disabled={showLoadingIndicator || !input.trim()}
                            className="w-12 h-12 bg-white/[0.03] hover:bg-gradient-to-tr hover:from-orange-500 hover:to-amber-500 rounded-[1.1rem] flex items-center justify-center transition-all text-white/40 hover:text-white disabled:opacity-30 disabled:hover:bg-white/[0.03] relative z-10"
                        >
                            <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>

            {/* Confirmation modal */}
            {showPreview && pendingOption && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                    <ConfirmationModal
                        option={pendingOption}
                        onConfirm={() => {
                            setShowPreview(false);
                            const isSynthetic = pendingParentId.startsWith('assistant_') || pendingParentId.startsWith('local_');
                            executeApply(pendingOption, pendingParentId, isSynthetic);
                            setPendingOption(null);
                            setPendingParentId('');
                        }}
                        onCancel={() => {
                            setShowPreview(false);
                            setPendingOption(null);
                            setPendingParentId('');
                        }}
                        isLoading={isApplyingChanges}
                    />
                </div>
            )}
        </div>
    );
}
