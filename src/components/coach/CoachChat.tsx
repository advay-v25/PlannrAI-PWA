'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';

import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CoachOption } from '@/types/coach-v4';

import { CoachOptionCard } from './CoachOptionCard';
import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';
import { usePremiumCalendar } from '@/components/calendar/premium-calendar-styles';

interface CoachChatProps {
    onClose?: () => void;
    onCalendarUpdate?: () => void;
}

export function CoachChat({ onClose, onCalendarUpdate }: CoachChatProps) {
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
        <div className="flex flex-col h-full glass relative overflow-hidden bg-bg-secondary/40">
            {/* Mesh Background Overlay (Subtle) */}
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-mesh-gradient"></div>

            {/* Header / Mode Indicator */}
            <div className="z-10 px-6 py-4 flex justify-between items-center border-b border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[var(--color-mind)] flex items-center justify-center shadow-glow">
                        <span className="text-white text-sm">⚡</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground tracking-tight flex items-center gap-1.5">
                            Donna
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-scifi-blink" />
                        </span>
                        <span className="text-[10px] text-foreground/40 uppercase tracking-wider">
                            AI Coach · Strategic Mode
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {minimalMode && (
                        <div className="flex items-center space-x-1.5 bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                            <span className="text-[9px] font-bold text-primary uppercase">Minimal</span>
                        </div>
                    )}
                    {/* New Chat Button */}
                    <button
                        onClick={handleNewChat}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-foreground/40 hover:text-foreground/70"
                        title="New conversation"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-foreground/40 hover:text-foreground/70"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

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
                        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-mind/50 mx-auto mb-6 flex items-center justify-center shadow-glow">
                             <span className="text-white text-2xl">⚡️</span>
                        </div>
                        <p className="text-lg font-semibold text-foreground mb-2">How shall we architect today?</p>
                        <p className="text-xs text-secondary max-w-[240px] mx-auto italic mb-6">
                            &quot;I&apos;m overwhelmed,&quot; or &quot;Protect my focus today.&quot;
                        </p>
                        
                        {/* Proactive Quick-Action Chips — Auto-send on click */}
                        <div className="flex flex-wrap justify-center gap-2 max-w-[300px] mx-auto">
                            {[
                                { label: "I'm overwhelmed", emoji: "😵‍💫" },
                                { label: "Protect my focus", emoji: "🛡️" },
                                { label: "Reschedule my day", emoji: "🔄" },
                                { label: "What should I do next?", emoji: "🤔" },
                                { label: "I need a break", emoji: "☕" },
                                { label: "Review my week", emoji: "📊" },
                            ].map(chip => (
                                <button
                                    key={chip.label}
                                    onClick={() => handleQuickChip(chip.label)}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full text-xs text-foreground/60 hover:text-foreground hover:bg-white/[0.08] hover:border-primary/30 transition-all disabled:opacity-50"
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

                        {/* Options UI */}
                        {message.role === 'assistant' && message.options && message.options.length > 0 && (
                            <div className="mt-4 flex flex-col space-y-3 animate-slide-up">
                                {!message.selected_option_id && !message.isApplying ? (
                                    message.options.map(option => (
                                        <CoachOptionCard
                                            key={option.id}
                                            option={option}
                                            onSelect={() => handleOptionSelect(option)}
                                            disabled={isLoading || !!message.isApplying}
                                            minimalMode={minimalMode}
                                        />
                                    ))
                                ) : message.isApplying ? (
                                    <div className="mx-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex items-center space-x-3 animate-pulse">
                                        <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center text-[10px] text-yellow-400">
                                            <span className="animate-spin">⚡</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-yellow-400 uppercase">Applying Changes...</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mx-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] text-white">✓</div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-primary uppercase">Applied Successfully</span>
                                                <span className="text-sm text-foreground/80">
                                                    {message.options.find(o => o.id === message.selected_option_id)?.title}
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
                                )}
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
                    <span className="font-bold tracking-wide text-sm uppercase">Applying protocol...</span>
                </div>
            )}

            {/* Undo Action */}
            {canUndo && !isLoading && (
                <div className="z-10 px-6 py-2 border-t border-white/5 bg-black/20 backdrop-blur-sm animate-fade-in">
                    <button
                        onClick={handleUndo}
                        className="text-[10px] font-bold text-primary hover:text-primary-hover uppercase tracking-widest flex items-center"
                    >
                        Revert Last Protocol ↩
                    </button>
                </div>
            )}

            {/* Input - Neural Control Bar */}
            <form onSubmit={handleSubmit} className="z-10 p-6 border-t border-white/5 bg-bg-secondary/80 backdrop-blur-xl">
                <div className="flex items-center space-x-3">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={messages.length > 0 ? "Ask a follow-up..." : "Define strategy..."}
                        disabled={isLoading}
                        className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-foreground/20 text-foreground"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-glow hover:shadow-glow-intense active:scale-95 transition-all text-white disabled:opacity-30 disabled:grayscale"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
            </form>

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
