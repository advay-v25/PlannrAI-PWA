import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Bot, User, Check, RotateCcw } from 'lucide-react';
import { OptionCard } from './option-card';
import { useAgentStore } from '@/stores/agent-store';
import type { CoachOption, CoachMode } from '@/types/coach-v4';

interface MessageBubbleProps {
    id: string;
    role: 'user' | 'agent';
    content: string;

    // V4 Props
    mode?: CoachMode;
    options?: CoachOption[];
    undoToken?: string | null;
    refusal?: { reason: string; question?: string | null };

    timestamp: Date;
    isImpossible?: boolean;
}

export const MessageBubble = ({ id, role, content, mode, options, undoToken, refusal, isImpossible, timestamp }: MessageBubbleProps) => {
    const isUser = role === 'user';
    const { isApplying, undoAction } = useAgentStore();

    const handleUndo = () => {
        if (undoToken) undoAction(undoToken);
    };

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

                    {/* EXECUTED MODE: Undo Button */}
                    {!isUser && mode === 'executed' && undoToken && (
                        <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-2">
                            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                                <Check className="w-3 h-3" /> Action Applied
                            </span>
                            <div className="flex-1" />
                            <button
                                onClick={handleUndo}
                                disabled={isApplying}
                                className="text-[10px] text-white/40 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                            >
                                <RotateCcw className="w-3 h-3" />
                                {isApplying ? 'Reverting...' : 'Undo'}
                            </button>
                        </div>
                    )}
                </div>

                {/* CHOICE MODE: Options Grid */}
                {!isUser && mode === 'choice' && options && options.length > 0 && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {options.map((option) => (
                            <OptionCard
                                key={option.id}
                                id={option.id}
                                title={option.title}
                                impact={option.impact}
                                isApplying={isApplying}
                            />
                        ))}
                    </div>
                )}

                {/* REFUSAL MODE */}
                {!isUser && (mode === 'refusal' || isImpossible) && (
                    <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
                        {refusal?.reason || "I couldn't complete this action."}
                        {refusal?.question && (
                            <div className="mt-1 text-white/60 italic border-t border-white/5 pt-1">
                                {refusal.question}
                            </div>
                        )}
                    </div>
                )}

                <span className="block px-1 text-[10px] text-white/30">
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </motion.div>
    );
};
