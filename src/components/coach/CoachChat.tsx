'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { ProposedOption } from '@/types/coach-v4';
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
    {
        label: "Do more today",
        emoji: '⚡️',
        action: 'do_more_today' as const,
        description: 'Find something to tackle right now',
    },
];

// Shape of applied ledger operations rendered in the "Applied" summary —
// ops arrive in several historical formats, so every field is optional.
interface AppliedOpSummary {
    type?: string;
    op?: string;
    title?: string;
    payload?: { title?: string; start_time?: string; end_time?: string };
    new_start?: string; new_end?: string;
    to_start?: string; to_end?: string;
    start_time?: string; end_time?: string;
    fields?: { start_time?: string; end_time?: string };
    changes?: { start_time?: string; end_time?: string };
}

// ── Inline option card with "Review & Execute" expand ───────────────────────
function InlineOptionCard({
    option,
    onSelect,
    disabled,
}: {
    option: ProposedOption & { recommended?: boolean; description?: string; tradeoff?: any; scenario_analysis?: any; preview?: any };
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
                    : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {option.recommended && (
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-500 mb-1.5 block">
                    ✦ Recommended
                </span>
            )}

            <p className="font-bold text-[var(--text-primary)] text-[14px] leading-snug mb-1">{option.title}</p>

            {option.description && (
                <p className="text-sm text-white/55 leading-relaxed whitespace-pre-line">{option.description}</p>
            )}

            {option.tradeoff && (
                <div className={`mt-2 text-xs p-2.5 rounded-xl border ${
                    option.tradeoff.severity === 'warning'
                        ? 'bg-red-500/5 text-red-300/80 border-red-500/15'
                        : option.tradeoff.severity === 'caution'
                        ? 'bg-yellow-500/5 text-yellow-300/80 border-yellow-500/15'
                        : 'bg-[var(--glass-bg)] text-[var(--text-tertiary)] border-[var(--glass-border)]'
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
                            ? 'bg-orange-500 text-[var(--text-primary)] hover:bg-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                            : 'bg-[var(--glass-bg)] text-white/80 hover:bg-white/[0.16]'
                    }`}
                >
                    {reviewOpen ? 'Hide Review' : 'Review & Execute'}
                </button>
                {option.scenario_analysis && (
                    <button
                        onClick={e => { e.stopPropagation(); setReviewOpen(!reviewOpen); }}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest bg-[var(--glass-bg)] text-white/35 hover:text-[var(--text-secondary)] transition-colors"
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
                        <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-3">
                            {option.impact && (
                                <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                                        Impact
                                    </p>
                                    <p className="text-xs text-orange-400/80 whitespace-pre-line leading-relaxed">{option.impact}</p>
                                </div>
                            )}
                            <div className="space-y-1 mt-3">
                                <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                                    Changes Preview
                                </p>
                            <p className="text-sm text-white/75 whitespace-pre-line leading-relaxed">
                                {(() => {
                                    let content = "";
                                    if (option.description && option.description.length > 10) {
                                        content = option.description + "\n\n";
                                    }
                                    
                                    const ops = option.ledger?.ops || (option as any).operations || (option as any).ops || [];
                                    const moveOp = ops.find((o: any) => o.type === 'move_block' || o.type === 'move');
                                    const deleteOp = ops.find((o: any) => o.type === 'delete_block' || o.type === 'delete');
                                    const compressOp = ops.find((o: any) => o.type === 'compress_block' || o.type === 'compress');
                                    
                                    if (compressOp) {
                                        const start = compressOp.new_start || compressOp.to_start;
                                        const end = compressOp.new_end || compressOp.to_end;
                                        content += `• The block is being shortened to ${start} - ${end}.\n`;
                                    }
                                    
                                    if (moveOp) {
                                        const start = moveOp.new_start || moveOp.to_start;
                                        const end = moveOp.new_end || moveOp.to_end;
                                        const date = moveOp.new_date || moveOp.date;
                                        
                                        let displayDate = date;
                                        if (date && date.includes('-')) {
                                            const [yyyy, mm, dd] = date.split('-');
                                            const dObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
                                            const dWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dObj.getDay()];
                                            displayDate = `${dWeek} ${dd}/${mm}`;
                                        }

                                        if (deleteOp) {
                                            content += `• The block being replaced is at ${start} to ${end} on ${displayDate}.\n• The missed block will now be scheduled from ${start} to ${end}.`;
                                        } else {
                                            content += `• The missed block will now be scheduled from ${start} to ${end} on ${displayDate}.`;
                                        }
                                    } else if (!compressOp && content === "") {
                                        content = "See impact for details.";
                                    }
                                    
                                    return content.trim();
                                })()}
                            </p>
                            </div>
                            {option.scenario_analysis && (
                                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{option.scenario_analysis}</p>
                            )}
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    if (!disabled) { setReviewOpen(false); onSelect(); }
                                }}
                                disabled={disabled}
                                className="w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-widest bg-orange-500 text-[var(--text-primary)] hover:bg-orange-400 transition-colors shadow-[0_0_20px_rgba(249,115,22,0.3)] disabled:opacity-50"
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
        stopGenerating,
        conversationId,
    } = useCoach();

    // Always open to a fresh blank chat when the user lands on Coach Hub.
    // Past chats are accessible via the left sidebar.
    useEffect(() => {
        clearConversation();
        setSyntheticMessages([]);
        // Fetch past conversations for the left sidebar on mount
        (async () => {
            try {
                setIsLoadingHistoryList(true);
                const res = await apiClient.get<any>('/api/coach/conversations');
                if (res) setPastConversations(res.conversations || []);
            } catch (err) {
                console.error('Failed to fetch conversations', err);
            } finally {
                setIsLoadingHistoryList(false);
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [input, setInput] = useState('');
    const [pendingOption, setPendingOption] = useState<ProposedOption | null>(null);
    const [pendingParentId, setPendingParentId] = useState<string>('');
    const [showPreview, setShowPreview] = useState(false);
    const [isApplyingChanges, setIsApplyingChanges] = useState(false);
    const [isQuickActionLoading, setIsQuickActionLoading] = useState(false);

    // Synthetic messages from quick-action endpoint. The endpoint also persists
    // the exchange as a coach conversation (so it appears in the sidebar and
    // reloads read-only like manual prompts); this holds the live-session copy.
    const [syntheticMessages, setSyntheticMessages] = useState<CoachMessage[]>([]);
    const [quickConversationId, setQuickConversationId] = useState<string | null>(null);

    // Auto-scroll when either message source updates
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, syntheticMessages]);

    // Combined ordered display list
    const allMessages = [...messages, ...syntheticMessages].sort(
        (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
    );

    // History panel
    const [pastConversations, setPastConversations] = useState<any[]>([]);
    const [isLoadingHistoryList, setIsLoadingHistoryList] = useState(true);

    const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        
        if (!window.confirm("Are you sure you want to delete this chat? This action is irreversible.")) {
            return;
        }

        try {
            const res = await apiClient.delete<any>(`/api/coach/conversations?id=${id}`);
            if (res) {
                setPastConversations(prev => prev.filter(c => c.id !== id));
                if (conversationId === id || quickConversationId === id) {
                    clearConversation();
                    setSyntheticMessages([]);
                    setQuickConversationId(null);
                }
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
    const handleQuickAction = async (action: 'reduce_today_load' | 'fix_today_schedule' | 'do_more_today') => {
        if (action === 'do_more_today') {
            sendMessage("I have some extra time today. What should I tackle right now?");
            return;
        }

        if (isQuickActionLoading || isLoading) return;
        setIsQuickActionLoading(true);

        const labelMap: Record<string, string> = {
            reduce_today_load: "Reduce today's load",
            fix_today_schedule: "Fix today's schedule",
        };

        try {
            // Capture current time in the browser — this is always in the user's local timezone
        const _now = new Date();
        const _clientDate = _now.toLocaleDateString('en-CA'); // "YYYY-MM-DD" in local time
        const _clientTime = _now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); // "HH:MM" in local 24h
        const _clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const raw = await apiClient.post<any>('/api/coach/quick-action', {
            action,
            clientDate: _clientDate,
            clientTime: _clientTime,
            clientTimezone: _clientTimezone,
        });

            if (!raw) {
                showToast('Something went wrong', 'error');
                return;
            }

            const { summary, ops } = raw;
            const assistantId = `assistant_${Date.now()}`;

            // The quick action is persisted server-side as a conversation — track it
            // so applying the option records against it, and refresh the sidebar.
            if (raw.conversation_id) {
                setQuickConversationId(raw.conversation_id);
                apiClient.get<any>('/api/coach/conversations')
                    .then(res => { if (res) setPastConversations(res.conversations || []); })
                    .catch(() => { /* sidebar refresh is best-effort */ });
            }

            const option: ProposedOption = {
                id: raw.option_id || `opt_${Date.now()}`,
                title: labelMap[action],
                description: summary,
                impact: `${raw.meta?.moved || 0} block${(raw.meta?.moved || 0) !== 1 ? 's' : ''} rescheduled${raw.meta?.dropped ? `, ${raw.meta.dropped} dropped` : ''}`,
                ledger: {
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
    const handleOptionSelect = async (option: ProposedOption, parentMessageId: string) => {
        const isSynthetic = parentMessageId.startsWith('assistant_') || parentMessageId.startsWith('local_');

        if ((option as any).tradeoff || (option as any).patch?.requires_confirmation) {
            setPendingOption(option);
            setPendingParentId(parentMessageId);
            setShowPreview(true);
            return;
        }

        await executeApply(option, parentMessageId, isSynthetic);
    };

    const executeApply = async (option: ProposedOption, parentMessageId: string, isSynthetic: boolean) => {
        setIsApplyingChanges(true);

        if (isSynthetic) {
            try {
                const result = await apiClient.post<any>('/api/coach/apply', {
                    conversation_id: quickConversationId,
                    option_id: option.id,
                    patch: option.ledger,
                });

                if (result.applied_operations > 0 || result.undo_token) {
                    setSyntheticMessages(prev => prev.map(m =>
                        m.id === parentMessageId
                            ? { ...m, selected_option_id: option.id, undoToken: result.undo_token }
                            : m
                    ));
                    // Sync the shared coach store so the global Undo strip works
                    // the same way it does for manual prompts
                    if (result.undo_token) {
                        useCoach.setState({ canUndo: true, lastUndoToken: result.undo_token });
                    }
                    onCalendarUpdate?.();
                    import('@/stores').then(({ useSyncStore }) => {
                        useSyncStore.getState().incrementGraphVersion();
                    });
                    const moveOps = option.ledger?.ops || [];
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
                const ops = appliedOption.ledger?.ops || [];
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
                import('@/stores').then(({ useSyncStore }) => {
                    useSyncStore.getState().incrementGraphVersion();
                });
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
        setQuickConversationId(null);
    };

    return (
        <div className="flex h-full relative overflow-hidden bg-transparent">

            {/* ── LEFT SIDEBAR — Past Chats ── */}
            <div className="w-56 shrink-0 hidden md:flex flex-col border-r border-[var(--glass-border)] bg-[var(--color-bg-primary)] dark:bg-[#080809]">
                {/* Sidebar header */}
                <div className="px-4 py-4 flex items-center justify-between border-b border-[var(--glass-border)] shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-[var(--text-tertiary)]">Coach Hub</span>
                    <button
                        onClick={handleNewChat}
                        title="New conversation"
                        className="p-1.5 rounded-lg hover:bg-[var(--glass-bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>

                {/* New Chat button */}
                <div className="px-3 pt-3 pb-2 shrink-0">
                    <button
                        onClick={handleNewChat}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15 transition-all text-left group"
                    >
                        <span className="text-orange-400 text-base">⚡</span>
                        <span className="text-[12px] font-bold text-orange-300/90 group-hover:text-orange-300">New Chat</span>
                    </button>
                </div>

                {/* Recents label */}
                <div className="px-4 pt-2 pb-1 shrink-0">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-[var(--text-tertiary)]">Recents</span>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 scrollbar-hide">
                    {isLoadingHistoryList ? (
                        <div className="space-y-1">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="w-full px-3 py-2.5 rounded-xl border border-transparent flex flex-col gap-1">
                                    <div className="h-4 bg-zinc-200 dark:bg-white/5 rounded-md animate-pulse w-3/4"></div>
                                    <div className="h-3 bg-zinc-100 dark:bg-white/5 rounded-md animate-pulse w-1/3"></div>
                                </div>
                            ))}
                        </div>
                    ) : pastConversations.length === 0 ? (
                        <p className="text-[11px] text-[var(--text-tertiary)] text-center py-6 leading-relaxed px-2">
                            No past chats yet.<br />Start a conversation below.
                        </p>
                    ) : (
                        pastConversations.map(conv => (
                            <div key={conv.id} className="relative group/item">
                                <button
                                    onClick={() => {
                                        clearConversation();
                                        setSyntheticMessages([]);
                                        setQuickConversationId(null);
                                        loadHistory(conv.id);
                                    }}
                                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--glass-bg)] border border-transparent hover:border-[var(--glass-border)] transition-all flex flex-col gap-0.5 pr-8"
                                >
                                    <span className="text-[12px] font-medium text-zinc-900 dark:text-white/65 group-hover:text-orange-500 dark:hover:text-orange-300 transition-colors truncate leading-snug">
                                        {conv.primary_topic || 'Strategy Session'}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 dark:text-[var(--text-tertiary)]">
                                        {conv.last_message_at
                                            ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })
                                            : '—'}
                                    </span>
                                </button>
                                <button
                                    onClick={e => handleDeleteChat(e, conv.id)}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/10 opacity-0 group-hover/item:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                    title="Delete"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── RIGHT — Chat area ── */}
            <div className="w-full min-w-0 flex flex-col h-full relative overflow-hidden">

                {/* ── Header ── */}
                <div className="z-20 px-5 py-4 flex justify-between items-center border-b border-[var(--glass-border)] bg-[var(--color-bg-primary)] dark:bg-[#0a0a0b]/80 backdrop-blur-md shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                            <span className="text-[var(--text-primary)] text-sm">⚡</span>
                        </div>
                        <div>
                            <span className="text-sm font-bold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight flex items-center gap-1.5">
                                Donna
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-scifi-blink" />
                            </span>
                            <span className="text-[10px] text-zinc-500 dark:text-white/35 uppercase tracking-wider block">
                                Strategic Mode · Calendar · Goals · Tasks
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleNewChat}
                            title="New conversation"
                            className="p-2 rounded-xl hover:bg-[var(--glass-bg)] transition-colors text-white/35 hover:text-[var(--text-primary)]"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Error banner ── */}
                {error && (
                    <div className="z-10 bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex justify-between items-center backdrop-blur-md shrink-0">
                        <span className="text-xs text-red-400 font-medium">{error}</span>
                        <button onClick={clearError} className="text-red-400/50 hover:text-red-400 text-lg leading-none">×</button>
                    </div>
                )}

                {/* ── Messages ── */}
                <div className="z-10 flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 py-6 space-y-6 scrollbar-hide">

                    {/* Empty state — 2 quick-action bubbles */}
                    {allMessages.length === 0 && !showLoadingIndicator && (
                        <div className="flex flex-col items-center mt-10 animate-fade-in">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500/50 mx-auto mb-5 flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                                <span className="text-[var(--text-primary)] text-2xl">⚡️</span>
                            </div>
                            <p className="text-lg font-semibold text-[var(--text-primary)] mb-1">How shall we architect today?</p>
                            <p className="text-xs text-zinc-500 dark:text-white/35 italic mb-8">Or type anything below to start a conversation.</p>

                            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                                {quickBubbles.map(bubble => (
                                    <button
                                        key={bubble.action}
                                        onClick={() => handleQuickAction(bubble.action)}
                                        disabled={showLoadingIndicator}
                                        className="flex-1 flex flex-col items-start gap-2 p-5 rounded-2xl bg-orange-500/5 dark:bg-[var(--glass-bg)] border border-orange-500/10 dark:border-[var(--glass-border)] hover:border-orange-500/25 hover:bg-orange-500/10 transition-all duration-200 text-left disabled:opacity-50 disabled:pointer-events-none group"
                                    >
                                        <span className="text-2xl">{bubble.emoji}</span>
                                        <span className="font-semibold text-[var(--text-primary)] text-[15px] group-hover:text-orange-300 transition-colors">{bubble.label}</span>
                                        <span className="text-xs text-[var(--text-tertiary)]">{bubble.description}</span>
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
                                !message.isApplying && (
                                <div className="pl-2 space-y-2">
                                    {message.options.map(opt => {
                                        const isOldChat = index < allMessages.length - 1;
                                        const isAlreadySelected = !!message.selected_option_id;
                                        const isDisabled = isApplyingChanges || showLoadingIndicator || isOldChat || isAlreadySelected;
                                        
                                        return (
                                            <InlineOptionCard
                                                key={opt.id}
                                                option={opt}
                                                onSelect={() => handleOptionSelect(opt, message.id || '')}
                                                disabled={isDisabled}
                                            />
                                        );
                                    })}
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
                                        <div className="flex items-start gap-3 w-full">
                                            <div className="mt-0.5 w-5 h-5 rounded-full bg-[var(--color-primary)] flex-shrink-0 flex items-center justify-center text-[10px] text-[var(--text-primary)]">✓</div>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase block mb-1">Applied</span>
                                                <div className="flex flex-col gap-1.5 w-full">
                                                    {(() => {
                                                        const opt = message.options?.find(o => o.id === message.selected_option_id);
                                                        const optExtras = opt as ({ operations?: unknown[]; ops?: unknown[] } | undefined);
                                                        const ops = (opt?.ledger?.ops || optExtras?.operations || optExtras?.ops || []) as AppliedOpSummary[];
                                                        if (!ops || ops.length === 0) {
                                                            return <span className="text-[13px] text-[var(--text-secondary)] leading-tight">{opt?.title || 'Changes applied'}</span>;
                                                        }
                                                        return ops.map((op, i) => {
                                                            const opType = op.type || op.op || '';
                                                            const title = op.title || op.payload?.title || opt?.title || 'Event';
                                                            let detail = '';
                                                            
                                                            if (['move_block', 'move', 'move_event'].includes(opType)) {
                                                                const start = op.new_start || op.to_start || op.start_time;
                                                                const end = op.new_end || op.to_end || op.end_time;
                                                                if (start && end) detail = ` → ${start} - ${end}`;
                                                            } else if (['delete_block', 'delete', 'delete_event'].includes(opType)) {
                                                                detail = ' (Removed)';
                                                            } else if (['create_event', 'create_block', 'create'].includes(opType)) {
                                                                const start = op.payload?.start_time || op.start_time || op.new_start;
                                                                const end = op.payload?.end_time || op.end_time || op.new_end;
                                                                if (start && end) detail = ` (Created at ${start} - ${end})`;
                                                                else detail = ' (Created)';
                                                            } else if (['update_event', 'update_block', 'update', 'compress_block', 'compress'].includes(opType)) {
                                                                const start = op.new_start || op.fields?.start_time || op.changes?.start_time;
                                                                const end = op.new_end || op.fields?.end_time || op.changes?.end_time;
                                                                detail = start && end ? ` → ${start} - ${end}` : ' (Updated)';
                                                            } else {
                                                                detail = ` (${opType})`;
                                                            }
                                                            
                                                            return (
                                                                <span key={i} className="text-[13px] text-[var(--text-secondary)] leading-tight block">
                                                                    • {title}{detail}
                                                                </span>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                        {message.undoToken && (
                                            <button
                                                onClick={e => { e.stopPropagation(); handleUndo(); }}
                                                disabled={isLoading}
                                                className="ml-2 flex-shrink-0 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400 uppercase tracking-wider hover:bg-red-500/20 transition-all disabled:opacity-50"
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
                                            className="px-3 py-1.5 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-full text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-orange-500/10 hover:border-orange-500/25 transition-all disabled:opacity-50"
                                        >
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Loading indicator */}
                    {showLoadingIndicator && (
                        <div className="flex items-start gap-4 animate-fade-in pl-2">
                            <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
                                <div className="absolute inset-2 bg-gradient-to-tr from-purple-500 to-orange-400 rounded-full animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.8)]" />
                                <div className="absolute inset-0 border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                                <div className="absolute inset-0 border-[1.5px] border-b-orange-500 border-r-transparent border-t-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                            </div>
                            <div className="pt-1">
                                <div className="bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[260px]">
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
                    <div className="absolute bottom-32 md:bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-primary)] text-[var(--text-primary)] px-6 py-3 rounded-full shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.5)] flex items-center gap-3 animate-fade-in">
                        <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                        <span className="font-bold tracking-wide text-sm uppercase">Applying Changes</span>
                    </div>
                )}

                {/* Undo strip */}
                {canUndo && !isLoading && (
                    <div className="z-10 px-4 md:px-8 py-3 border-t border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm flex justify-center shrink-0">
                        <button
                            onClick={handleUndo}
                            className="text-[10px] font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] uppercase tracking-widest flex items-center gap-2"
                        >
                            Revert Last Protocol ↩
                        </button>
                    </div>
                )}

                {/* Input bar */}
                <div className="z-10 w-full border-t border-[var(--glass-border)] bg-[var(--color-bg-primary)] dark:bg-[#0a0a0b]/80 backdrop-blur-3xl pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-4 shrink-0">
                    <form onSubmit={handleSubmit} className="px-4 md:px-8 py-3">
                        <div className="flex items-center gap-3 bg-zinc-100 dark:bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[1.5rem] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all focus-within:border-orange-500/50 dark:focus-within:bg-[#0a0a0b] focus-within:shadow-[0_0_40px_rgba(249,115,22,0.15)] group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-amber-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder={allMessages.length > 0 ? 'Message Donna…' : 'Or type anything to start a conversation…'}
                                disabled={showLoadingIndicator}
                                className="flex-1 bg-transparent px-4 py-3.5 text-[15px] focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-[var(--text-tertiary)] text-zinc-900 dark:text-[var(--text-primary)] font-medium relative z-10"
                            />
                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const returnedContent = await stopGenerating();
                                        if (returnedContent) setInput(returnedContent);
                                    }}
                                    className="w-12 h-12 bg-red-500/10 hover:bg-red-500/20 rounded-[1.1rem] flex items-center justify-center transition-all text-red-400 border border-red-500/20 relative z-10 group"
                                    title="Stop Generating & Edit"
                                >
                                    <div className="w-3.5 h-3.5 bg-red-400 group-hover:bg-red-300 rounded-[3px]" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={isQuickActionLoading || !input.trim()}
                                    className="w-12 h-12 bg-orange-500 text-white dark:bg-[var(--glass-bg)] hover:bg-orange-600 dark:hover:bg-gradient-to-tr dark:hover:from-orange-500 dark:hover:to-amber-500 rounded-[1.1rem] flex items-center justify-center transition-all dark:text-[var(--text-tertiary)] dark:hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-orange-500 dark:disabled:hover:bg-[var(--glass-bg)] relative z-10"
                                >
                                    <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* Confirmation modal */}
                {showPreview && pendingOption && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-[var(--glass-bg)] backdrop-blur-md">
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
        </div>
    );
}
