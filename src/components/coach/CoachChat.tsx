'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { Compass, MessageSquarePlus, BatteryLow, RefreshCw, Zap, Star, Loader2, Check, X, Undo2, RotateCcw, ChevronDown, Plus, Trash2, Send } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { useCoach } from '@/hooks/use-coach';
import { ProposedOption } from '@/types/coach-v4';
import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';
import { ProactiveBanner } from './ProactiveBanner';
import { usePremiumCalendar } from '@/components/calendar/premium-calendar-styles';
import { motion, AnimatePresence } from 'framer-motion';

interface CoachChatProps {
    onCalendarUpdate?: () => void;
    initialQuickAction?: 'reduce_today_load' | 'fix_today_schedule' | 'do_more_today';
}

// ── Quick action bubbles shown on empty state ────────────────────────────────
const quickBubbles = [
    {
        label: "Reduce today's load",
        icon: BatteryLow,
        action: 'reduce_today_load' as const,
        description: 'Move low-priority blocks to later in the week',
    },
    {
        label: "Fix today's schedule",
        icon: RefreshCw,
        action: 'fix_today_schedule' as const,
        description: 'Reschedule overdue blocks to open slots',
    },
    {
        label: "Do more today",
        icon: Zap,
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
            whileHover={disabled ? undefined : { y: -2 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className={`group relative p-4 rounded-2xl border transition-all duration-200 ${
                option.recommended
                    ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_45%,_black),0_0_14px_-4px_var(--color-primary-glow)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_45%,_black),0_0_16px_-4px_var(--color-primary-glow)] hover:border-[var(--color-primary)]/70'
                    : 'border-[var(--color-primary)]/25 bg-[var(--glass-bg)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_32%,_black),0_0_8px_-5px_var(--color-primary-glow)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_32%,_black),0_0_10px_-5px_var(--color-primary-glow)] hover:border-[var(--color-primary)]/45'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {option.recommended && (
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)] mb-1.5 flex items-center gap-1">
                    <Star className="w-3 h-3" fill="currentColor" aria-hidden="true" /> Recommended
                </span>
            )}

            <p className="font-bold text-[var(--text-primary)] text-[14px] leading-snug mb-1">{option.title}</p>

            {option.description && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{option.description}</p>
            )}

            {option.tradeoff && (
                <div className={`mt-2 text-xs p-2.5 rounded-xl border ${
                    option.tradeoff.severity === 'warning'
                        ? 'bg-[var(--color-error)]/5 text-[var(--color-error)] border-[var(--color-error)]/20'
                        : option.tradeoff.severity === 'caution'
                        ? 'bg-[var(--color-warning)]/5 text-[var(--color-warning)] border-[var(--color-warning)]/20'
                        : 'bg-[var(--glass-bg)] text-[var(--text-tertiary)] border-[var(--glass-border)]'
                }`}>
                    <span className="font-bold">Note: </span>{option.tradeoff.warning}
                </div>
            )}

            <div className="mt-3 flex items-center gap-2">
                <motion.button
                    whileHover={disabled ? undefined : { scale: 1.03 }}
                    whileTap={disabled ? undefined : { scale: 0.96 }}
                    onClick={e => { e.stopPropagation(); setReviewOpen(!reviewOpen); }}
                    disabled={disabled}
                    className="px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all bg-[var(--color-primary)]/15 backdrop-blur-xl border border-[var(--color-primary)]/30 text-[var(--color-primary)] shadow-[0_0_16px_-4px_var(--color-primary-glow),inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:bg-[var(--color-primary)]/25 hover:border-[var(--color-primary)]/50"
                >
                    {reviewOpen ? 'Hide Review' : 'Review & Execute'}
                </motion.button>
                {option.scenario_analysis && (
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={e => { e.stopPropagation(); setReviewOpen(!reviewOpen); }}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        Why?
                    </motion.button>
                )}
            </div>

            <AnimatePresence>
                {reviewOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="mt-3 overflow-hidden"
                    >
                        <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-3">
                            {option.impact && (
                                <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                                        Impact
                                    </p>
                                    <p className="text-xs text-[var(--color-primary)]/90 whitespace-pre-line leading-relaxed">{option.impact}</p>
                                </div>
                            )}
                            <div className="space-y-1 mt-3">
                                <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                                    Changes Preview
                                </p>
                            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
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
                            <motion.button
                                whileHover={disabled ? undefined : { scale: 1.02 }}
                                whileTap={disabled ? undefined : { scale: 0.97 }}
                                onClick={e => {
                                    e.stopPropagation();
                                    if (!disabled) { setReviewOpen(false); onSelect(); }
                                }}
                                disabled={disabled}
                                className="w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-widest bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-colors shadow-[0_0_20px_var(--color-primary-glow)] disabled:opacity-50"
                            >
                                Apply Changes
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────
export function CoachChat({ onCalendarUpdate, initialQuickAction }: CoachChatProps) {
    const { showToast } = useToast();
    const {
        messages,
        isLoading,
        isLoadingHistory,
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
        proactiveSuggestion,
        hasLoadedProactive,
        loadProactiveInsight,
        dismissProactive,
        actOnProactive,
    } = useCoach();

    // Built, styled, and wired into the store since earlier this session, but
    // nothing ever called loadProactiveInsight() or rendered the banner here
    // — proactiveSuggestion stayed permanently null on this page. (The home
    // page has its own separate, hand-rolled proactive banner fed by the
    // same API, unrelated to this store slice.)
    useEffect(() => {
        if (!hasLoadedProactive) loadProactiveInsight();
    }, [hasLoadedProactive, loadProactiveInsight]);

    // Resume whatever conversation was already in progress — `useCoach` is a
    // persisted Zustand store, so it survives navigating away and back. This
    // effect used to unconditionally clear it on every mount, which meant an
    // in-progress chat (and any options shown, unselected) vanished the
    // moment the user visited another tab and came back. "New Chat" (below)
    // remains the explicit, intentional way to start fresh.
    useEffect(() => {
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
    }, []);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [showNewMessagePill, setShowNewMessagePill] = useState(false);

    const [input, setInput] = useState('');
    const [pendingOption, setPendingOption] = useState<ProposedOption | null>(null);
    const [pendingParentId, setPendingParentId] = useState<string>('');
    const [showPreview, setShowPreview] = useState(false);
    const [isApplyingChanges, setIsApplyingChanges] = useState(false);
    const [isQuickActionLoading, setIsQuickActionLoading] = useState(false);

    const [loadingConvId, setLoadingConvId] = useState<string | null>(null);

    // Auto-scroll when messages update — but only if the user is already
    // near the bottom. Force-scrolling regardless of scroll position used to
    // yank someone back down mid-read of earlier messages; if they've
    // scrolled up, surface a "new message" pill instead so they can jump
    // down on their own terms.
    useEffect(() => {
        const container = messagesContainerRef.current;
        const nearBottom = !container || (container.scrollHeight - container.scrollTop - container.clientHeight < 150);
        if (nearBottom) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setShowNewMessagePill(false);
        } else {
            setShowNewMessagePill(true);
        }
    }, [messages]);

    // Quick-action results append into the same persisted `messages` array
    // (via appendMessages) as regular chat, but resolve out of strict append
    // order if two async operations land back-to-back — sort defensively.
    const allMessages = [...messages].sort(
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
                if (conversationId === id || messages.some(m => m.conversationId === id)) {
                    clearConversation();
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
        if (isQuickActionLoading || isLoading) return;
        setIsQuickActionLoading(true);

        const labelMap: Record<string, string> = {
            reduce_today_load: "Reduce today's load",
            fix_today_schedule: "Fix today's schedule",
            do_more_today: "Do more today",
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

            const { summary, ops, options: multiOptions, proposed_options } = raw;
            const assistantId = `assistant_${Date.now()}`;
            // Quick-action always persists as its own separate coach_conversations
            // row server-side — stamped onto each message below (not a shared outer
            // variable) so a second quick action in the same session can't clobber
            // which conversation the first one's option should apply against.
            const thisConversationId: string | undefined = raw.conversation_id;

            if (raw.conversation_id) {
                apiClient.get<any>('/api/coach/conversations')
                    .then(res => { if (res) setPastConversations(res.conversations || []); })
                    .catch(() => { /* sidebar refresh is best-effort */ });
            }

            const effectiveOptions = multiOptions || proposed_options;

            if (effectiveOptions && Array.isArray(effectiveOptions) && effectiveOptions.length > 0) {
                // Multi-option response path (e.g. do_more_today)
                useCoach.getState().appendMessages([
                    {
                        id: `user_${Date.now()}`,
                        role: 'user' as const,
                        content: labelMap[action],
                        timestamp: Date.now(),
                        conversationId: thisConversationId,
                    },
                    {
                        id: assistantId,
                        role: 'assistant' as const,
                        content: summary,
                        options: effectiveOptions.map((opt: any) => ({
                            id: opt.id,
                            title: opt.title,
                            description: opt.description,
                            impact: opt.impact,
                            disabled: opt.disabled,
                            ledger: opt.ledger ? {
                                ops: opt.ledger.ops,
                                operations: opt.ledger.ops,
                                undoable: true,
                                scope: 'week' as const,
                                reason: opt.title,
                                requires_confirmation: false,
                            } : { ops: [] },
                            recommended: opt.recommended,
                        })) as ProposedOption[],
                        timestamp: Date.now() + 1,
                        conversationId: thisConversationId,
                    },
                ]);
            } else {
                // Single option path (existing)
                const option: ProposedOption = {
                    id: raw.option_id || `opt_${Date.now()}`,
                    title: labelMap[action],
                    description: summary,
                    impact: `${raw.meta?.moved || 0} block${(raw.meta?.moved || 0) !== 1 ? 's' : ''} rescheduled${raw.meta?.dropped ? `, ${raw.meta.dropped} dropped` : ''}`,
                    ledger: {
                        ops: ops ? ops.map((op: any) => {
                            if (op.type === 'move_block') {
                                return { op: 'move_event', event_id: op.block_id, title: op.title, to_start: op.new_start, to_end: op.new_end, date: op.new_date };
                            }
                            if (op.type === 'delete_block') {
                                return { op: 'delete_event', event_id: op.block_id, title: op.title };
                            }
                            return op;
                        }) : [],
                        operations: ops || [], // passed to apply/route normalizer
                        undoable: true,
                        scope: 'week' as const,
                        reason: labelMap[action],
                        // false: the inline "Review & Execute" panel IS the confirmation step —
                        // no second modal needed
                        requires_confirmation: false,
                    } as any,
                    recommended: true,
                };

                useCoach.getState().appendMessages([
                    {
                        id: `user_${Date.now()}`,
                        role: 'user' as const,
                        content: labelMap[action],
                        timestamp: Date.now(),
                        conversationId: thisConversationId,
                    },
                    {
                        id: assistantId,
                        role: 'assistant' as const,
                        content: summary,
                        options: ops && ops.length > 0 ? [option] : undefined,
                        timestamp: Date.now() + 1,
                        conversationId: thisConversationId,
                    },
                ]);
            }
        } catch (err: any) {
            showToast('Failed to process request', 'error');
            console.error('[QuickAction]', err);
        } finally {
            setIsQuickActionLoading(false);
        }
    };

    // Fire a quick action automatically when the page navigates in with one
    // pre-selected (e.g. a dashboard "Do more today" shortcut) — replaces a
    // prior implementation that DOM-queried and .click()'d the quick-action
    // bubble by its label text, which broke silently on any copy change.
    const firedInitialQuickAction = useRef(false);
    useEffect(() => {
        if (initialQuickAction && !firedInitialQuickAction.current) {
            firedInitialQuickAction.current = true;
            handleQuickAction(initialQuickAction);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialQuickAction]);

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
                const parentMessage = messages.find(m => m.id === parentMessageId);
                const result = await apiClient.post<any>('/api/coach/apply', {
                    conversation_id: parentMessage?.conversationId,
                    option_id: option.id,
                    patch: option.ledger,
                });

                if (result.applied_operations > 0 || result.undo_token) {
                    useCoach.getState().updateMessage(parentMessageId, { selected_option_id: option.id, undoToken: result.undo_token });
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
    };

    return (
        <div className="flex h-full relative overflow-hidden bg-transparent">

            {/* ── LEFT SIDEBAR — Past Chats ── */}
            <div className="w-56 shrink-0 hidden md:flex flex-col border-r border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/40 backdrop-blur-xl">
                {/* Sidebar header */}
                <div className="px-4 py-4 flex items-center justify-between border-b border-[var(--glass-border)] shrink-0">
                    <span className="text-overline">Coach Hub</span>
                    <button
                        onClick={handleNewChat}
                        title="New conversation"
                        aria-label="Start a new conversation"
                        className="p-2.5 -m-1 rounded-lg hover:bg-[var(--glass-bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* New Chat button */}
                <div className="px-3 pt-3 pb-2 shrink-0">
                    <button
                        onClick={handleNewChat}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 hover:bg-[var(--color-primary)]/15 transition-all text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                    >
                        <MessageSquarePlus className="w-4 h-4 text-[var(--color-primary)] shrink-0" aria-hidden="true" />
                        <span className="text-[12px] font-bold text-[var(--color-primary)] group-hover:text-[var(--color-primary-hover)]">New Chat</span>
                    </button>
                </div>

                {/* Recents label */}
                <div className="px-4 pt-2 pb-1 shrink-0">
                    <span className="text-overline">Recents</span>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 scrollbar-hide">
                    {isLoadingHistoryList ? (
                        <div className="space-y-1">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="w-full px-3 py-2.5 rounded-xl border border-transparent flex flex-col gap-1">
                                    <div className="h-4 bg-[var(--glass-bg-hover)] rounded-md animate-pulse w-3/4"></div>
                                    <div className="h-3 bg-[var(--glass-bg-hover)] rounded-md animate-pulse w-1/3"></div>
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
                                        if (isLoadingHistory) return;
                                        setLoadingConvId(conv.id);
                                        clearConversation();
                                        loadHistory(conv.id).finally(() => setLoadingConvId(null));
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--glass-bg)] border transition-all flex flex-col gap-0.5 pr-8 ${loadingConvId === conv.id ? 'bg-[var(--glass-bg)] border-[var(--glass-border)]' : 'border-transparent hover:border-[var(--glass-border)]'}`}
                                >
                                    <span className="text-[12px] font-medium text-[var(--text-primary)]/80 group-hover:text-[var(--color-primary)] transition-colors truncate leading-snug">
                                        {conv.primary_topic || 'Strategy Session'}
                                    </span>
                                    <span className="text-[10px] text-[var(--text-tertiary)]">
                                        {conv.last_message_at
                                            ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })
                                            : '—'}
                                    </span>
                                </button>
                                <button
                                    onClick={e => handleDeleteChat(e, conv.id)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-[var(--text-muted)] opacity-40 group-hover/item:opacity-100 focus-visible:opacity-100 hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]/50 transition-all"
                                    title="Delete"
                                    aria-label={`Delete conversation: ${conv.primary_topic || 'Strategy Session'}`}
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── RIGHT — Chat area ── */}
            <div className="w-full min-w-0 flex flex-col h-full relative overflow-hidden">

                {/* ── Header ── */}
                <div className="z-20 px-5 py-4 flex justify-between items-center border-b border-[var(--glass-border)] bg-[var(--glass-bg-elevated)] backdrop-blur-xl shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-soft)] flex items-center justify-center shadow-[0_0_15px_var(--color-primary-glow)]">
                            <Compass className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <span className="text-[15px] font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-1.5">
                                Donna
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-scifi-blink" />
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block">
                                Your Chief of Staff
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleNewChat}
                            title="New conversation"
                            aria-label="Start a new conversation"
                            className="p-2.5 rounded-xl hover:bg-[var(--glass-bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── Proactive suggestion banner ── */}
                {proactiveSuggestion && (
                    <div className="z-10 px-4 md:px-8 pt-4 shrink-0">
                        <ProactiveBanner
                            suggestion={proactiveSuggestion}
                            onAct={actOnProactive}
                            onDismiss={dismissProactive}
                        />
                    </div>
                )}

                {/* ── Error banner ── */}
                {error && (
                    <div className="z-10 bg-[var(--color-error)]/10 border-b border-[var(--color-error)]/20 px-4 py-2 flex justify-between items-center backdrop-blur-md shrink-0">
                        <span className="text-xs text-[var(--color-error)] font-medium">{error}</span>
                        <button
                            onClick={clearError}
                            aria-label="Dismiss error"
                            className="text-[var(--color-error)]/60 hover:text-[var(--color-error)] p-1.5 -m-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]/50"
                        ><X className="w-3.5 h-3.5" /></button>
                    </div>
                )}

                {/* ── Messages ── */}
                <div ref={messagesContainerRef} className="z-10 flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 py-6 space-y-6 scrollbar-hide">

                    {/* Skeleton loader for history */}
                    {isLoadingHistory && allMessages.length === 0 && (
                        <div className="flex flex-col space-y-6 mt-4 animate-fade-in w-full max-w-2xl mx-auto px-4 md:px-0">
                            <div className="self-end w-2/3 md:w-1/2 h-20 rounded-2xl rounded-tr-sm bg-[var(--glass-bg)] border border-[var(--glass-border)] animate-pulse" />
                            <div className="self-start w-3/4 md:w-2/3 h-24 rounded-2xl rounded-tl-sm bg-[var(--glass-bg)] border border-[var(--glass-border)] animate-pulse" />
                            <div className="self-end w-1/2 md:w-1/3 h-16 rounded-2xl rounded-tr-sm bg-[var(--glass-bg)] border border-[var(--glass-border)] animate-pulse" />
                        </div>
                    )}

                    {/* Empty state — 3 quick-action bubbles */}
                    {allMessages.length === 0 && !showLoadingIndicator && !isLoadingHistory && (
                        <div className="flex flex-col items-center mt-10 animate-fade-in">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-primary-soft)]/60 mx-auto mb-5 flex items-center justify-center shadow-[0_0_30px_var(--color-primary-glow)]">
                                <Compass className="w-6 h-6 text-white" />
                            </div>
                            <p className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-1.5">How shall we architect today?</p>
                            <p className="text-xs text-[var(--text-tertiary)] italic mb-8">Or type anything below to start a conversation.</p>

                            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                                {quickBubbles.map(bubble => (
                                    <button
                                        key={bubble.action}
                                        onClick={() => handleQuickAction(bubble.action)}
                                        disabled={showLoadingIndicator}
                                        className="flex-1 flex flex-col items-start gap-2 p-5 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-[var(--color-primary)]/25 hover:bg-[var(--color-primary)]/5 transition-all duration-200 text-left disabled:opacity-50 disabled:pointer-events-none group shadow-[var(--shadow-sm)]"
                                    >
                                        <bubble.icon className="w-6 h-6 text-[var(--color-primary)]" aria-hidden="true" />
                                        <span className="font-semibold text-[var(--text-primary)] text-[15px] group-hover:text-[var(--color-primary)] transition-colors">{bubble.label}</span>
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
                                                disabled={isDisabled || (opt as any).disabled}
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
                                    <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-[inset_3px_0_0_0_var(--color-warning),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-warning)_40%,_black)] dark:shadow-[inset_3px_0_0_0_var(--color-warning),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-warning)_40%,_black)] flex items-center gap-3 animate-pulse">
                                        <div className="w-5 h-5 rounded-full bg-[var(--color-warning)]/20 flex items-center justify-center">
                                            <Loader2 className="w-3 h-3 text-[var(--color-warning)] animate-spin" aria-hidden="true" />
                                        </div>
                                        <span className="text-[11px] font-bold text-[var(--color-warning)] uppercase tracking-wide">Applying Changes…</span>
                                    </div>
                                </div>
                            )}

                            {/* Applied confirmation */}
                            {message.role === 'assistant' &&
                                message.selected_option_id &&
                                !message.isApplying && (
                                <div className="pl-2">
                                    <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-[inset_3px_0_0_0_var(--color-primary),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_40%,_black)] dark:shadow-[inset_3px_0_0_0_var(--color-primary),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_40%,_black)] flex items-center justify-between">
                                        <div className="flex items-start gap-3 w-full">
                                            <div className="mt-0.5 w-5 h-5 rounded-full bg-[var(--color-primary)] flex-shrink-0 flex items-center justify-center text-white">
                                                <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-overline text-[var(--color-primary)] block mb-1">Applied</span>
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
                                                className="ml-2 flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 text-[10px] font-bold text-[var(--color-error)] uppercase tracking-wide hover:bg-[var(--color-error)]/20 transition-all disabled:opacity-50"
                                            >
                                                <Undo2 className="w-3 h-3" aria-hidden="true" /> Undo
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
                                            className="px-3 py-1.5 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-full text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/25 transition-all disabled:opacity-50"
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
                                <div className="absolute inset-2 bg-gradient-to-tr from-[var(--color-mind)] to-[var(--color-primary)] rounded-full animate-pulse shadow-[0_0_15px_var(--color-primary-glow)]" />
                                <div className="absolute inset-0 border-2 border-t-[var(--color-mind)] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                                <div className="absolute inset-0 border-[1.5px] border-b-[var(--color-primary)] border-r-transparent border-t-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                            </div>
                            <div className="pt-1">
                                <div className="bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[260px]">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] text-[var(--text-secondary)] font-mono tracking-wide italic">
                                            {stages[loadingStage]}
                                        </span>
                                        <div className="flex gap-1 shrink-0">
                                            <span className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce shadow-[0_0_8px_var(--color-primary-glow)]" style={{ animationDelay: '0s' }} />
                                            <span className="w-1.5 h-1.5 bg-[var(--color-mind)] rounded-full animate-bounce shadow-[0_0_8px_var(--color-mind-glow)]" style={{ animationDelay: '0.2s' }} />
                                            <span className="w-1.5 h-1.5 bg-[var(--color-craft)] rounded-full animate-bounce shadow-[0_0_8px_var(--color-craft-glow)]" style={{ animationDelay: '0.4s' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* New message pill — shown instead of force-scrolling when the
                    user has scrolled up to read earlier messages */}
                {showNewMessagePill && (
                    <button
                        onClick={() => {
                            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                            setShowNewMessagePill(false);
                        }}
                        className="absolute bottom-28 md:bottom-24 left-1/2 -translate-x-1/2 z-40 bg-[var(--color-primary)] text-white px-4 py-2 rounded-full shadow-[0_0_20px_var(--color-primary-glow)] flex items-center gap-2 text-xs font-bold uppercase tracking-wide animate-fade-in hover:brightness-110 transition-all"
                    >
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        New message <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                )}

                {/* Changes in progress toast */}
                {isApplyingChanges && (
                    <div className="absolute bottom-32 md:bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-primary)] text-white px-6 py-3 rounded-full shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.5)] flex items-center gap-3 animate-fade-in">
                        <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                        <span className="font-bold tracking-wide text-sm uppercase">Applying Changes</span>
                    </div>
                )}

                {/* Undo strip */}
                {canUndo && !isLoading && (
                    <div className="z-10 px-4 md:px-8 py-3 border-t border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm flex justify-center shrink-0">
                        <button
                            onClick={handleUndo}
                            className="text-[10px] font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] uppercase tracking-wide flex items-center gap-2"
                        >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" /> Revert Last Protocol
                        </button>
                    </div>
                )}

                {/* Input bar */}
                <div className="z-10 w-full border-t border-[var(--glass-border)] bg-[var(--glass-bg-elevated)] backdrop-blur-3xl pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-4 shrink-0">
                    <form onSubmit={handleSubmit} className="px-4 md:px-8 py-3">
                        <div className="flex items-center gap-3 bg-[var(--color-bg-secondary)] dark:bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-3xl p-1.5 shadow-[var(--shadow-lg)] transition-all focus-within:border-[var(--color-primary)]/50 focus-within:shadow-[0_0_40px_var(--color-primary-glow)] group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-primary)]/5 to-[var(--color-primary-soft)]/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder={allMessages.length > 0 ? 'Message Donna…' : 'Or type anything to start a conversation…'}
                                disabled={showLoadingIndicator || isApplyingChanges}
                                aria-label="Message Donna"
                                className="flex-1 bg-transparent px-4 py-3.5 text-[15px] focus:outline-none placeholder:text-[var(--text-tertiary)] text-[var(--text-primary)] font-medium relative z-10"
                            />
                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const returnedContent = await stopGenerating();
                                        if (returnedContent) setInput(returnedContent);
                                    }}
                                    className="w-12 h-12 bg-[var(--color-error)]/10 hover:bg-[var(--color-error)]/20 rounded-2xl flex items-center justify-center transition-all text-[var(--color-error)] border border-[var(--color-error)]/20 relative z-10 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]/50"
                                    title="Stop Generating & Edit"
                                    aria-label="Stop generating and edit message"
                                >
                                    <div className="w-3.5 h-3.5 bg-[var(--color-error)] group-hover:bg-[var(--color-error)]/80 rounded-[3px]" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={isQuickActionLoading || isApplyingChanges || !input.trim()}
                                    aria-label="Send message"
                                    className="w-12 h-12 bg-[var(--color-primary)] text-white dark:bg-[var(--glass-bg)] hover:bg-[var(--color-primary-hover)] dark:hover:bg-gradient-to-tr dark:hover:from-[var(--color-primary)] dark:hover:to-[var(--color-primary-soft)] rounded-2xl flex items-center justify-center transition-all dark:text-[var(--text-tertiary)] dark:hover:text-white disabled:opacity-30 disabled:hover:bg-[var(--color-primary)] dark:disabled:hover:bg-[var(--glass-bg)] relative z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            )}
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
        </div>
    );
}
