import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, X } from 'lucide-react';
import { useAgentStore } from '@/stores/agent-store';
import { MessageBubble } from './message-bubble';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
    className?: string;
    onClose?: () => void;
}

export const ChatInterface = ({ className, onClose }: ChatInterfaceProps) => {
    const { messages, sendMessage, isLoading, clearMessages } = useAgentStore();
    const [input, setInput] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Initial greeting if empty
    useEffect(() => {
        if (messages.length === 0) {
            // Optional: hydrate with a greeting
        }
    }, [messages.length]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const text = input;
        setInput('');
        await sendMessage(text);
    };

    return (
        <div className={cn("flex h-full flex-col overflow-hidden bg-black/40 backdrop-blur-xl border-l border-white/5", className)}>
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b border-white/5 px-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-white">PlannrAI Agent</h3>
                        <p className="text-[10px] text-white/40">Online • Driven by Reasoning</p>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-white/40 hover:text-white">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10">
                <div className="space-y-6">
                    {messages.length === 0 && (
                        <div className="flex h-[200px] flex-col items-center justify-center text-center opacity-40">
                            <Sparkles className="mb-2 h-8 w-8 text-white/20" />
                            <p className="text-sm text-white/60">How can I help you adjust your schedule?</p>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <MessageBubble
                            key={msg.id}
                            id={msg.id}
                            role={msg.role}
                            content={msg.content}
                            options={msg.options}
                            timestamp={msg.timestamp}
                            isImpossible={msg.isImpossible}
                        />
                    ))}

                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center gap-2 px-4 text-xs text-white/30"
                        >
                            <div className="flex gap-1">
                                {[0, 1, 2].map((i) => (
                                    <motion.div
                                        key={i}
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.2 }}
                                        className="h-1.5 w-1.5 rounded-full bg-emerald-500/40"
                                    />
                                ))}
                            </div>
                            Thinking...
                        </motion.div>
                    )}
                    <div ref={endRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-white/5 p-4">
                <form onSubmit={handleSubmit} className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="e.g., I'm busy at 4pm today..."
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-4 pr-12 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </form>
            </div>
        </div>
    );
};
