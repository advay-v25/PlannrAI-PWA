'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Sparkles, Loader2 } from 'lucide-react';

interface AISuggestion {
    id: string;
    text: string;
    type: 'goal' | 'habit' | 'task' | 'schedule';
    metadata?: Record<string, unknown>;
}

interface AISuggestionChipProps {
    suggestion: AISuggestion;
    onAccept: (suggestion: AISuggestion) => Promise<void> | void;
    onDismiss: (suggestion: AISuggestion) => void;
    className?: string;
}

export function AISuggestionChip({
    suggestion,
    onAccept,
    onDismiss,
    className = '',
}: AISuggestionChipProps) {
    const [loading, setLoading] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const handleAccept = async () => {
        setLoading(true);
        try {
            await onAccept(suggestion);
            setAccepted(true);
            setTimeout(() => setDismissed(true), 1000);
        } catch {
            setLoading(false);
        }
    };

    const handleDismiss = () => {
        setDismissed(true);
        onDismiss(suggestion);
    };

    if (dismissed) return null;

    const typeColors = {
        goal: 'from-purple-500/20 to-orange-500/20 border-purple-500/30',
        habit: 'from-green-500/20 to-orange-500/20 border-green-500/30',
        task: 'from-red-500/20 to-orange-500/20 border-red-500/30',
        schedule: 'from-orange-500/20 to-amber-500/20 border-orange-500/30',
    };

    const typeIcons = {
        goal: '🎯',
        habit: '🔄',
        task: '✓',
        schedule: '📅',
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, height: 0 }}
                className={`group ${className}`}
            >
                <div
                    className={`
                        flex items-center gap-3 p-3 rounded-xl border
                        bg-gradient-to-r ${typeColors[suggestion.type]}
                        transition-all duration-200
                        ${accepted ? 'border-green-500/50 bg-green-500/10' : ''}
                    `}
                >
                    {/* Icon */}
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--glass-bg)]">
                        {accepted ? (
                            <Check className="w-4 h-4 text-green-400" />
                        ) : (
                            <span>{typeIcons[suggestion.type]}</span>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <Sparkles className="w-3 h-3 text-orange-400" />
                            <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                                AI Suggestion
                            </span>
                        </div>
                        <p className={`text-sm text-[var(--text-primary)] ${accepted ? 'line-through opacity-60' : ''}`}>
                            {suggestion.text}
                        </p>
                    </div>

                    {/* Actions */}
                    {!accepted && (
                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={handleAccept}
                                disabled={loading}
                                className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors disabled:opacity-50"
                                title="Accept suggestion"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                            </button>
                            <button
                                onClick={handleDismiss}
                                className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                                title="Dismiss suggestion"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

// Wrapper for displaying multiple suggestions
interface AISuggestionsListProps {
    suggestions: AISuggestion[];
    onAccept: (suggestion: AISuggestion) => Promise<void> | void;
    onDismiss: (suggestion: AISuggestion) => void;
    className?: string;
}

export function AISuggestionsList({
    suggestions,
    onAccept,
    onDismiss,
    className = '',
}: AISuggestionsListProps) {
    if (suggestions.length === 0) return null;

    return (
        <div className={`space-y-2 ${className}`}>
            {suggestions.map((suggestion) => (
                <AISuggestionChip
                    key={suggestion.id}
                    suggestion={suggestion}
                    onAccept={onAccept}
                    onDismiss={onDismiss}
                />
            ))}
        </div>
    );
}

export default AISuggestionChip;
