import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, X, Brain, ChevronRight } from 'lucide-react';
import { useAgentStore } from '@/stores/agent-store';
import { MessageBubble } from './message-bubble';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
    className?: string;
    onClose?: () => void;
}

export const ChatInterface = ({ className, onClose }: ChatInterfaceProps) => {
    const { messages, sendMessage, isLoading, clearMessages, loadHistory, applyOption, undoAction } = useAgentStore();
    const [input, setInput] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load history on mount
    useEffect(() => {
        loadHistory();
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const text = input;
        setInput('');
        await sendMessage(text);
    };

    return (
        <div className={cn("flex h-full flex-col overflow-hidden bg-[var(--color-bg-secondary)]/90 backdrop-blur-xl", className)}>
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b border-[var(--glass-border)] px-4 bg-[var(--color-bg-tertiary)]/50">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-[0_0_15px_rgba(255,77,0,0.1)]">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Neural Coach</h3>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono">Cortex V2 • Active</p>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[var(--glass-border)] space-y-6">
                {messages.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center text-center opacity-60 p-8">
                        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10 flex items-center justify-center mb-4 animate-pulse-slow">
                            <Brain className="w-8 h-8 text-[var(--color-primary)]" />
                        </div>
                        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">Systems Online</h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                            I'm ready to analyze your schedule, optimize your energy, and clear your mind.
                        </p>
                    </div>
                )}

                {messages.map((msg) => (
                    <MessageBubble
                        key={msg.id}
                        id={msg.id}
                        role={msg.role === 'agent' ? 'assistant' : msg.role}
                        content={msg.content}
                        options={msg.options}
                        undoToken={msg.undoToken}
                        onApplyOption={applyOption}
                        onUndo={undoAction}
                        timestamp={msg.timestamp instanceof Date ? msg.timestamp.getTime() : msg.timestamp}
                        isImpossible={msg.isImpossible}
                    />
                ))}

                {/* Thinking Visualization (Neural Activity) */}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] max-w-[80%]"
                    >
                        <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-primary)] uppercase tracking-widest">
                            <Brain className="w-3 h-3 animate-pulse" />
                            <span>Neural Processing</span>
                        </div>
                        <div className="space-y-1">
                            {/* Simulated "Two-Pass" steps */}
                            <ThinkingStep text="Analyzing Context..." delay={0} />
                            <ThinkingStep text="Checking Constraints..." delay={1.5} />
                            <ThinkingStep text="Formulating Plan..." delay={3} />
                        </div>
                    </motion.div>
                )}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-[var(--glass-border)] bg-[var(--color-bg-tertiary)]/30">
                <form onSubmit={handleSubmit} className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask me to adjust your plan..."
                        disabled={isLoading}
                        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] py-3 pl-4 pr-12 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-primary)]/50 focus:bg-[var(--glass-bg-hover)] focus:outline-none transition-all disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center rounded-lg bg-[var(--color-primary)] text-white transition-all hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:hover:bg-[var(--color-primary)]"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

// Helper for the "Thinking" list
const ThinkingStep = ({ text, delay }: { text: string; delay: number }) => (
    <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay }}
        className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"
    >
        <div className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
        {text}
    </motion.div>
);
