import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import { OptionCard } from './option-card';
import { useAgentStore } from '@/stores/agent-store';

import type { Sacrifice } from '@/lib/agents/core/types';

interface MessageBubbleProps {
    id: string;
    role: 'user' | 'agent';
    content: string;
    options?: {
        id: string;
        label: string;
        description?: string;
        warnings?: string[];
        sacrifices?: Sacrifice[];
    }[];
    timestamp: Date;
    isImpossible?: boolean;
}

export const MessageBubble = ({ id, role, content, options, isImpossible }: MessageBubbleProps) => {
    const isUser = role === 'user';
    const { isApplying } = useAgentStore();

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
                "flex w-full gap-3",
                isUser ? "flex-row-reverse" : "flex-row"
            )}
        >
            <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                isUser ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-white/5 text-white/70"
            )}>
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>

            <div className={cn(
                "relative max-w-[85%] space-y-2",
                isUser ? "items-end" : "items-start"
            )}>
                {/* Text Bubble */}
                <div className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    isUser
                        ? "bg-emerald-500/10 text-emerald-100 rounded-tr-sm"
                        : "bg-white/5 text-white/80 rounded-tl-sm border border-white/5"
                )}>
                    {content}
                </div>

                {/* Options Grid */}
                {!isUser && options && options.length > 0 && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {options.map((option, idx) => (
                            <OptionCard
                                key={option.id}
                                id={option.id}
                                label={option.label}
                                description={option.description}
                                warnings={option.warnings}
                                sacrifices={option.sacrifices}
                                isApplying={isApplying}
                            />
                        ))}
                    </div>
                )}

                {/* Impossible State */}
                {!isUser && isImpossible && (
                    <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
                        I couldn't find a way to make this work without severe conflicts. Try a different time?
                    </div>
                )}

                <span className="block px-1 text-[10px] text-white/30">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </motion.div>
    );
};
