import { motion } from 'framer-motion';
import { Bot, User, AlertTriangle, Check, ArrowRight, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';

interface MessageBubbleProps {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    options?: any[]; // For structured patches
    timestamp?: number;
    isImpossible?: boolean;
    undoToken?: string | null;
    onApplyOption?: (optionId: string) => void;
    onUndo?: (token: string) => void;
}

export function MessageBubble({ role, content, options, isImpossible, undoToken, onApplyOption, onUndo }: MessageBubbleProps) {
    const isUser = role === 'user';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
                "flex w-full gap-3",
                isUser ? "flex-row-reverse" : "flex-row"
            )}
        >
            {/* Avatar */}
            <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                isUser
                    ? "bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]"
                    : "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20 text-[var(--color-primary)]"
            )}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble Content */}
            <div className={cn(
                "max-w-[85%] space-y-2",
                isUser ? "items-end" : "items-start"
            )}>
                <div className={cn(
                    "px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
                    isUser
                        ? "bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-tr-sm"
                        : "bg-[var(--color-bg-tertiary)] border border-[var(--glass-border)] text-[var(--text-secondary)] rounded-tl-sm"
                )}>
                    {content}
                </div>

                {/* Error / Warning State */}
                {isImpossible && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                        <AlertTriangle className="w-3 h-3" />
                        <span>I can't do that within your constraints.</span>
                    </div>
                )}

                {/* Patch / Options UI */}
                {options && options.length > 0 && (
                    <div className="space-y-3 mt-2">
                        {options.map((option, idx) => (
                            <GlassCard
                                key={idx}
                                className="p-3 border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10 transition-colors group cursor-pointer"
                                onClick={() => onApplyOption?.(option.id)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                                            {option.title || option.label || "Proposed Change"}
                                        </h4>
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                            {option.tradeoff || option.impact || "Click to apply this adjustment."}
                                        </p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-[var(--color-primary)] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                </div>

                                {/* Mini Visualization of Ops */}
                                {option.patch?.ops && (
                                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                                        {option.patch.ops.slice(0, 3).map((op: any, i: number) => (
                                            <div key={i} className="text-[10px] px-2 py-1 rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] whitespace-nowrap font-mono text-[var(--text-tertiary)]">
                                                {(op.op || '').replace('_event', '').toUpperCase()}
                                            </div>
                                        ))}
                                        {option.patch.ops.length > 3 && (
                                            <div className="text-[10px] px-2 py-1 text-[var(--text-tertiary)]">+{option.patch.ops.length - 3}</div>
                                        )}
                                    </div>
                                )}
                            </GlassCard>
                        ))}
                    </div>
                )}

                {/* Undo Button */}
                {undoToken && onUndo && (
                    <button
                        onClick={() => onUndo(undoToken)}
                        className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-1"
                    >
                        <Undo2 className="w-3 h-3" />
                        <span>Undo</span>
                    </button>
                )}
            </div>
        </motion.div>
    );
}
