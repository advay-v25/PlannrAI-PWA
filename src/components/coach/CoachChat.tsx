'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';

import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { CoachOption } from '@/types/coach-v4';

import { CoachOptionCard } from './CoachOptionCard';
import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';

interface CoachChatProps {
    onClose?: () => void;
    onCalendarUpdate?: () => void;
}

export function CoachChat({ onClose, onCalendarUpdate }: CoachChatProps) {
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
    } = useCoach();

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const [input, setInput] = useState('');
    const [pendingOption, setPendingOption] = useState<CoachOption | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    // Handle form submit
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const message = input;
        setInput('');

        await sendMessage(message);
    };

    // Handle option selection
    const handleOptionSelect = (option: CoachOption) => {
        // If tradeoff requires confirmation, show modal
        if (option.tradeoff || option.patch.requires_confirmation) {
            setPendingOption(option);
            setShowPreview(true);
        } else {
            // Apply directly
            applyAndRefresh(option);
        }
    };

    // Apply option and refresh calendar
    const applyAndRefresh = async (option: CoachOption) => {
        // Find the assistant message that contains this option
        const parentMessage = messages.find(m => m.options?.some(o => o.id === option.id));
        if (!parentMessage) return;

        const success = await applyOption(parentMessage.id, option.id);

        if (success) {
            onCalendarUpdate?.();
            setShowPreview(false);
            setPendingOption(null);
        }
    };

    // Handle undo
    const handleUndo = async () => {
        const success = await undo();
        if (success) {
            onCalendarUpdate?.();
        }
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
                        <span className="text-sm font-bold text-foreground tracking-tight">
                            Donna
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
                        <p className="text-xs text-secondary max-w-[240px] mx-auto italic">
                            "I'm overwhelmed," or "Protect my focus today."
                        </p>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div key={message.id || index} className="space-y-4">
                        <CoachMessageBubble message={message} />

                        {/* Options UI */}
                        {message.role === 'assistant' && message.options && message.options.length > 0 && (
                            <div className="mt-4 flex flex-col space-y-3 animate-slide-up">
                                {!message.selected_option_id ? (
                                    message.options.map(option => (
                                        <CoachOptionCard
                                            key={option.id}
                                            option={option}
                                            onSelect={() => handleOptionSelect(option)}
                                            disabled={isLoading}
                                            minimalMode={minimalMode}
                                        />
                                    ))
                                ) : (
                                    <div className="mx-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center space-x-3">
                                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] text-white">✓</div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-primary uppercase">Strategically Applied</span>
                                            <span className="text-sm text-foreground/80">
                                                {message.options.find(o => o.id === message.selected_option_id)?.title}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center space-x-2 pl-4 animate-fade-in">
                        <div className="flex space-x-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-glow"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-75 shadow-glow"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-150 shadow-glow"></div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/50">Analyzing Neural Load</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

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
                        placeholder="Define strategy..."
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
                        onConfirm={() => applyAndRefresh(pendingOption)}
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
