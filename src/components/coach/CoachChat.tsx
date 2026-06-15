'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';

import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CoachOption } from '@/types/coach-v4';

import { CoachOptionCard } from './CoachOptionCard';
import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';
import { usePremiumCalendar } from '@/components/calendar/premium-calendar-styles';

interface CoachChatProps {
    onCalendarUpdate?: () => void;
    onClose?: () => void;
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

    // Load history on mount
    useEffect(() => {
        if (messages.length === 0) {
            loadHistory();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const [input, setInput] = useState('');
    const [pendingOption, setPendingOption] = useState<CoachOption | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [isApplyingChanges, setIsApplyingChanges] = useState(false);
    
    // History State
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [pastConversations, setPastConversations] = useState<any[]>([]);
    const [isLoadingHistoryList, setIsLoadingHistoryList] = useState(false);

    const handleOpenHistory = async () => {
        setIsHistoryOpen(!isHistoryOpen);
        if (!isHistoryOpen && pastConversations.length === 0) {
            setIsLoadingHistoryList(true);
            try {
                const res = await apiClient.get('/api/coach/conversations') as any;
                if (res?.success) {
                    setPastConversations(res.conversations || []);
                }
            } catch (err) {
                console.error("Failed to fetch conversations", err);
            } finally {
                setIsLoadingHistoryList(false);
            }
        }
    };

    const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // prevent loading the chat
        try {
            const res = await apiClient.delete(`/api/coach/conversations?id=${id}`) as any;
            if (res?.success) {
                setPastConversations(prev => prev.filter(c => c.id !== id));
                showToast('Chat deleted', 'success');
            }
        } catch (err) {
            console.error("Failed to delete conversation", err);
            showToast('Failed to delete chat', 'error');
        }
    };

    // Thinking state stages
    const [loadingStage, setLoadingStage] = useState(0);
    const stages = [
        "Reading your schedule...",
        "Analyzing goals and blocks...",
        "Finding free slots...",
        "Finding optimal placement...",
        "Preparing your options..."
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

    const loadingStageText = stages[loadingStage];

    // Handle form submit
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const message = input;
        setInput('');

        await sendMessage(message);
    };

    // Handle quick-chip click — auto-send immediately
    const handleQuickChip = (text: string) => {
        if (isLoading) return;
        sendMessage(text);
    };

    // Handle option selection
    const handleOptionSelect = (option: CoachOption) => {
        // If tradeoff requires confirmation, show modal
        if (option.tradeoff || option.patch.requires_confirmation) {
            setPendingOption(option);
            setShowPreview(true);
        } else {
            // Apply directly
            handleApply(option);
        }
    };

    // Apply option and refresh calendar
    const handleApply = async (option: CoachOption) => {
        const parentMessage = messages.find(m => m.options?.some(o => o.id === option.id));
        if (!parentMessage) return;

        // Immediately close the modal and show the progress indicator
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

                // Turn off generation animation after a delay if replan
                if (isReplan) {
                    setTimeout(() => {
                        usePremiumCalendar.getState().setIsAnimating(false);
                    }, 2500); // Wait for generation animation to complete
                }
            }
        } finally {
            setIsApplyingChanges(false);
        }
    };

    // Handle undo
    const handleUndo = async () => {
        const success = await undo();
        if (success) {
            onCalendarUpdate?.();
        }
    };

    // Handle new chat
    const handleNewChat = () => {
        clearConversation();
    };

    return (
        <div className="flex flex-col h-full relative overflow-hidden bg-transparent">
            {/* Header / Mode Indicator */}
            <div className="z-10 px-6 py-4 flex justify-between items-center border-b border-white/5 bg-[#0a0a0b]/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                        <span className="text-white text-sm">⚡</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                            Donna
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-scifi-blink" />
                        </span>
                        <span className="text-[10px] text-foreground/40 uppercase tracking-wider">
                            Strategic Mode
                        </span>
                        <span className="text-[9px] text-foreground/30 mt-0.5">
                            Using: Calendar • Goals • Tasks
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2 relative">
                    {/* History Button */}
                    <button
                        onClick={handleOpenHistory}
                        className={`p-2 rounded-xl transition-colors ${isHistoryOpen ? 'bg-orange-500/20 text-orange-400' : 'text-foreground/40 hover:bg-white/[0.05] hover:text-white'}`}
                        title="Chat History"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>

                    {/* New Chat Button */}
                    <button
                        onClick={handleNewChat}
                        className="p-2 rounded-xl hover:bg-white/[0.05] transition-colors text-foreground/40 hover:text-white"
                        title="New conversation"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* History Overlay */}
            {isHistoryOpen && (
                <div className="absolute inset-x-0 top-[73px] bottom-0 z-50 bg-[#0a0a0b]/95 backdrop-blur-xl flex flex-col border-t border-white/5 animate-slide-up">
                    <div className="flex justify-between items-center px-6 py-4 border-b border-white/5">
                        <span className="text-sm font-bold text-white uppercase tracking-widest">Past Conversations</span>
                        <button onClick={() => setIsHistoryOpen(false)} className="text-white/40 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {isLoadingHistoryList ? (
                            <div className="p-4 text-center text-sm text-white/40 animate-pulse">Loading history...</div>
                        ) : pastConversations.length === 0 ? (
                            <div className="p-4 text-center text-sm text-white/40">No past conversations found.</div>
                        ) : (
                            pastConversations.map(conv => (
                                <div key={conv.id} className="relative group/item flex items-center">
                                    <button
                                        onClick={() => {
                                            setIsHistoryOpen(false);
                                            loadHistory(conv.id);
                                        }}
                                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all flex flex-col gap-1"
                                    >
                                        <span className="text-sm font-medium text-white/90 group-hover/item:text-orange-400 transition-colors pr-8">
                                            {conv.primary_topic || 'Strategy Session'}
                                        </span>
                                        <span className="text-xs text-white/40">
                                            {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true }) : 'Unknown date'}
                                        </span>
                                    </button>
                                    
                                    {/* Delete Button */}
                                    <button 
                                        onClick={(e) => handleDeleteChat(e, conv.id)}
                                        className="absolute right-3 p-2 rounded-lg text-white/20 opacity-0 group-hover/item:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                        title="Delete chat"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="z-10 bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex justify-between items-center backdrop-blur-md animate-slide-up">
                    <span className="text-xs text-red-400 font-medium">{error}</span>
                    <button onClick={clearError} className="text-red-400/50 hover:text-red-400">×</button>
                </div>
            )}

            {/* Messages Area */}
            <div className="z-10 flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
                {messages.length === 0 && !isLoading && (
                    <div className="text-center text-gray-500 mt-12 animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500/50 mx-auto mb-6 flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                             <span className="text-white text-2xl">⚡️</span>
                        </div>
                        <p className="text-lg font-semibold text-white mb-2">How shall we architect today?</p>
                        <p className="text-xs text-white/40 max-w-[240px] mx-auto italic mb-6">
                            &quot;I&apos;m overwhelmed,&quot; or &quot;Protect my focus today.&quot;
                        </p>
                        
                        {/* Proactive Quick-Action Chips — Auto-send on click */}
                        <div className="flex flex-wrap justify-center gap-2 max-w-[300px] mx-auto">
                            {[
                                { label: "Fix today's schedule", emoji: "🔄" },
                                { label: "Reduce today's load", emoji: "😵‍💫" },
                                { label: "Review this week", emoji: "📈" },
                                { label: "Protect my goals", emoji: "🛡️" }
                            ].map(chip => (
                                <button
                                    key={chip.label}
                                    onClick={() => handleQuickChip(chip.label)}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-full text-[13px] font-medium text-foreground/70 hover:text-orange-500 hover:bg-orange-500/10 hover:border-orange-500/30 shadow-sm transition-all disabled:opacity-50"
                                >
                                    {chip.emoji} {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div key={message.id || index} className="space-y-4">
                        <CoachMessageBubble message={message} />

                        {/* Options UI - Removed from chronological chat flow. Options are now hoisted to the Recommended Actions section of the dashboard */}
                        {message.role === 'assistant' && message.options && message.options.length > 0 && message.isApplying && (
                            <div className="mt-4 flex flex-col space-y-3 animate-slide-up">
                                <div className="mx-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex items-center space-x-3 animate-pulse">
                                    <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center text-[10px] text-yellow-400">
                                        <span className="animate-spin">⚡</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-yellow-400 uppercase">Applying Changes...</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {message.role === 'assistant' && message.selected_option_id && !message.isApplying && (
                            <div className="mt-4 flex flex-col space-y-3 animate-slide-up">
                                <div className="mx-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] text-white">✓</div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-primary uppercase">Applied Successfully</span>
                                            <span className="text-sm text-foreground/80">
                                                {message.options?.find(o => o.id === message.selected_option_id)?.title}
                                            </span>
                                        </div>
                                    </div>
                                    {message.undoToken && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUndo();
                                            }}
                                            disabled={isLoading}
                                            className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400 uppercase tracking-wider hover:bg-red-500/20 transition-all disabled:opacity-50 shrink-0"
                                        >
                                            ↩ Undo
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Suggested Actions — Clickable chips after assistant messages */}
                        {message.role === 'assistant' && message.suggestedActions && message.suggestedActions.length > 0 && !message.selected_option_id && (
                            <div className="flex flex-wrap gap-2 pl-4 animate-fade-in">
                                {message.suggestedActions.map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleQuickChip(action)}
                                        disabled={isLoading}
                                        className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full text-[11px] text-foreground/50 hover:text-foreground hover:bg-primary/10 hover:border-primary/30 transition-all disabled:opacity-50"
                                    >
                                        {action}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading Indicator — Pulsating Orb */}
                {isLoading && (
                    <div className="flex items-start gap-4 animate-fade-in pl-2">
                        <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                            {/* Inner core */}
                            <div className="absolute inset-2 bg-gradient-to-tr from-purple-500 to-orange-400 rounded-full animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.8)]" />
                            {/* Spinning outer rings */}
                            <div className="absolute inset-0 border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                            <div className="absolute inset-0 border-[1.5px] border-b-orange-500 border-r-transparent border-t-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                        </div>
                        <div className="flex flex-col space-y-2 pt-1">
                            <div className="bg-black/40 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl rounded-tl-sm max-w-[280px]">
                                <div className="flex items-center gap-3">
                                    <span className="text-[11px] text-white/60 font-mono tracking-wide">
                                        {loadingStageText}
                                    </span>
                                    <div className="flex gap-1">
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

            {/* Changes in Progress Popup */}
            {isApplyingChanges && (
                <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50 bg-[var(--color-primary)] text-white px-6 py-3 rounded-full shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.5)] flex items-center gap-3 animate-fade-in">
                    <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                    <span className="font-bold tracking-wide text-sm uppercase">Changes in Progress</span>
                </div>
            )}

            {/* Undo Action */}
            {canUndo && !isLoading && (
                <div className="z-10 px-8 py-3 border-t border-white/5 bg-black/20 backdrop-blur-sm animate-fade-in flex justify-center">
                    <button
                        onClick={handleUndo}
                        className="text-[10px] font-bold text-primary hover:text-primary-hover uppercase tracking-widest flex items-center gap-2"
                    >
                        Revert Last Protocol ↩
                    </button>
                </div>
            )}

            {/* Input & Quick Actions Container */}
            <div className="z-10 flex flex-col border-t border-white/5 bg-[#0a0a0b]/80 backdrop-blur-3xl pb-2">
                {/* Quick Action Chips */}
                {!isLoading && (
                    <div className="px-6 pt-4 pb-2 overflow-x-auto scrollbar-hide">
                        <div className="flex gap-2 min-w-max">
                            {['Plan my day', 'What should I do next?', 'Replan my week', 'Show my progress'].map((chip) => (
                                <button
                                    key={chip}
                                    onClick={() => handleQuickChip(chip)}
                                    className="px-4 py-2 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-[11px] font-bold text-foreground/50 hover:text-white transition-all whitespace-nowrap tracking-wide"
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input - Neural Control Bar */}
                <form onSubmit={handleSubmit} className="px-6 py-3">
                    <div className="flex items-center space-x-3 bg-black/40 border border-white/10 rounded-[1.5rem] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all focus-within:border-orange-500/50 focus-within:bg-[#0a0a0b] focus-within:shadow-[0_0_40px_rgba(249,115,22,0.15)] group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-amber-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={messages.length > 0 ? "Message Donna..." : "What do you want to accomplish?"}
                            disabled={isLoading}
                            className="flex-1 bg-transparent px-4 py-3.5 text-[15px] focus:outline-none placeholder:text-foreground/30 text-white font-medium relative z-10"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="w-12 h-12 bg-white/[0.03] hover:bg-gradient-to-tr hover:from-orange-500 hover:to-amber-500 rounded-[1.1rem] flex items-center justify-center transition-all text-white/40 hover:text-white disabled:opacity-30 disabled:text-white/20 disabled:hover:bg-white/[0.03] relative z-10 shadow-sm"
                        >
                            <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>

            {/* Confirmation Modal Overlay */}
            {showPreview && pendingOption && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                   <ConfirmationModal
                        option={pendingOption}
                        onConfirm={() => handleApply(pendingOption)}
                        onCancel={() => {
                            setShowPreview(false);
                            setPendingOption(null);
                        }}
                        isLoading={isLoading}
                    />
                </div>
            )}
        </div>
    );
}
