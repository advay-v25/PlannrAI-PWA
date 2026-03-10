'use client';

import { useState, FormEvent } from 'react';
import { useCoach, CoachMessage, CoachOption } from '@/hooks/useCoach';
import { CoachOptionCard } from './CoachOptionCard';
import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';

interface CoachChatProps {
    onCalendarUpdate?: () => void;
}

export function CoachChat({ onCalendarUpdate }: CoachChatProps) {
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
        messagesEndRef,
    } = useCoach();

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
        const success = await applyOption(option);

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

    // Get last assistant message for options display
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
    const hasActiveOptions = lastAssistantMessage?.options &&
        !lastAssistantMessage.selected_option_id &&
        lastAssistantMessage.options.length > 0;

    return (
        <div className="flex flex-col h-full">
            {/* Minimal Mode Badge */}
            {minimalMode && (
                <div className="bg-blue-50 border-b border-blue-100 px-4 py-2">
                    <span className="text-sm text-blue-700 font-medium">
                        🌙 Minimal Mode - Showing fewer, simpler options
                    </span>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex justify-between items-center">
                    <span className="text-sm text-red-700">{error}</span>
                    <button
                        onClick={clearError}
                        className="text-red-500 hover:text-red-700"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !isLoading && (
                    <div className="text-center text-gray-500 mt-8">
                        <p className="text-lg font-medium mb-2">How can I help?</p>
                        <p className="text-sm">
                            Try: "I'm busy at 4pm" or "I'm exhausted" or "What should I do now?"
                        </p>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div key={message.id || index}>
                        <CoachMessageBubble message={message} />

                        {/* Show options for assistant messages */}
                        {message.role === 'assistant' && message.options && message.options.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {!message.selected_option_id ? (
                                    // Options not yet selected
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
                                    // Option was selected - show confirmation
                                    <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
                                        ✓ Applied: {message.options.find(o => o.id === message.selected_option_id)?.title}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex items-center space-x-2 text-gray-500">
                        <div className="animate-pulse">●</div>
                        <div className="animate-pulse delay-100">●</div>
                        <div className="animate-pulse delay-200">●</div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Undo Button */}
            {canUndo && !isLoading && (
                <div className="px-4 py-2 border-t bg-gray-50">
                    <button
                        onClick={handleUndo}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                        ↩️ Undo last change
                    </button>
                </div>
            )}

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="p-4 border-t">
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Tell me what you need..."
                        disabled={isLoading}
                        className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </div>
            </form>

            {/* Confirmation Modal */}
            {showPreview && pendingOption && (
                <ConfirmationModal
                    option={pendingOption}
                    onConfirm={() => applyAndRefresh(pendingOption)}
                    onCancel={() => {
                        setShowPreview(false);
                        setPendingOption(null);
                    }}
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}
