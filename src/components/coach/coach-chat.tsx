
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, X, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCoach } from '@/hooks/use-coach';
import { OptionCard } from './option-card';

interface CoachChatProps {
    className?: string;
    onClose?: () => void;
}

export const CoachChat = ({ className, onClose }: CoachChatProps) => {
    const { messages, sendMessage, isLoading, applyOption, loadHistory } = useCoach();
    const [input, setInput] = useState('');
    const endRef = useRef<HTMLDivElement>(null);

    // Initial Load
    useEffect(() => {
        loadHistory();
    }, []);

    // Auto-scroll
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
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Chief of Staff</h3>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono">Run by Cosmos</p>
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
                        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">Ready to Orchestrate</h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                            "I'm busy", "I'm tired", or "Plan my day."
                        </p>
                    </div>
                )}

                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "max-w-[85%] space-y-2",
                                msg.role === 'user' ? "ml-auto" : "mr-auto"
                            )}
                        >
                            {/* Bubble */}
                            <div className={cn(
                                "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                                msg.role === 'user'
                                    ? "bg-[var(--color-primary)] text-white rounded-br-none"
                                    : "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-bl-none"
                            )}>
                                {msg.content}
                            </div>

                            {/* Options Grid */}
                            {msg.role === 'assistant' && msg.options && msg.options.length > 0 && (
                                <div className="grid grid-cols-1 gap-2 mt-2">
                                    {msg.options.map((opt) => (
                                        <OptionCard
                                            key={opt.id}
                                            option={opt}
                                            onApply={(id) => applyOption(msg.id, id)}
                                            isApplying={msg.isApplying}
                                            isApplied={msg.appliedOptionId === opt.id}
                                            disabled={!!msg.appliedOptionId} // Disable others if one applied
                                        />
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Thinking Indicator */}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] w-fit"
                    >
                        <div className="flex space-x-1">
                            <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce"></div>
                        </div>
                        <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Thinking</span>
                    </motion.div>
                )}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-[var(--glass-border)] bg-[var(--color-bg-tertiary)]/30">
                <form onSubmit={handleSubmit} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Command the Chief of Staff..."
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
