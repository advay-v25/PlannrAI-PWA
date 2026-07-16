'use client';

import { useState } from 'react';
import { Compass, ChevronDown } from 'lucide-react';
import { CoachMessage } from '@/hooks/use-coach';
import { cn } from '@/lib/utils';

interface CoachMessageBubbleProps {
    message: CoachMessage;
}

/**
 * Render basic markdown: **bold**, *italic*, `code`, line breaks, and bullet lists.
 * Returns an array of React elements.
 */
function renderMarkdown(text: string): React.ReactNode[] {
    // Messages persisted with null content (e.g. AI returned no dialogue) must not crash the hub
    const lines = (text || '').split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, lineIdx) => {
        // Detect bullet points
        const bulletMatch = line.match(/^\s*[-•]\s+(.*)/);
        if (bulletMatch) {
            elements.push(
                <div key={lineIdx} className="flex items-start gap-1.5 pl-1">
                    <span className="text-[var(--color-primary)]/60 mt-0.5 text-[10px]">•</span>
                    <span>{renderInline(bulletMatch[1])}</span>
                </div>
            );
            return;
        }

        // Numbered list
        const numberedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)/);
        if (numberedMatch) {
            elements.push(
                <div key={lineIdx} className="flex items-start gap-1.5 pl-1">
                    <span className="text-[var(--color-primary)]/60 font-bold text-[10px] mt-0.5 min-w-[14px]">{numberedMatch[1]}.</span>
                    <span>{renderInline(numberedMatch[2])}</span>
                </div>
            );
            return;
        }

        // Empty line = spacing
        if (line.trim() === '') {
            elements.push(<div key={lineIdx} className="h-1.5" />);
            return;
        }

        // Regular line with inline formatting
        elements.push(
            <span key={lineIdx}>
                {renderInline(line)}
                {lineIdx < lines.length - 1 && <br />}
            </span>
        );
    });

    return elements;
}

/**
 * Render inline markdown: **bold**, *italic*, `code`
 */
function renderInline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    // Match: **bold**, *italic*, `code`
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        if (match[2]) {
            // **bold**
            parts.push(<strong key={match.index} className="font-bold text-[var(--text-primary)]">{match[2]}</strong>);
        } else if (match[3]) {
            // *italic*
            parts.push(<em key={match.index} className="italic text-[var(--text-primary)]/80">{match[3]}</em>);
        } else if (match[4]) {
            // `code`
            parts.push(
                <code key={match.index} className="text-[10px] px-1 py-0.5 rounded bg-[var(--glass-bg)] text-[var(--color-primary)] font-mono">
                    {match[4]}
                </code>
            );
        }
        lastIndex = regex.lastIndex;
    }

    // Remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

function sanitizeContent(text: string): string {
    if (!text) return text;
    
    // Check if text looks like a JSON blob
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.includes('"options":') || trimmed.includes('"summary":')) {
        try {
            // Try parsing if it's purely JSON
            const parsed = JSON.parse(trimmed);
            if (parsed.summary) return parsed.summary;
            if (parsed.text) return parsed.text;
            if (parsed.response) return parsed.response;
            return "I've prepared some options for you — check below.";
        } catch (e) {
            // Unparseable JSON or JSON mixed with text
            // If it starts with { and fails to parse, it's likely truncated JSON
            if (trimmed.startsWith('{')) {
                return "I've prepared some options for you — check below.";
            }
            
            // Try to extract text before the JSON block if it's mixed
            const jsonStart = trimmed.indexOf('{');
            if (jsonStart > 0) {
                const prefix = trimmed.substring(0, jsonStart).trim();
                if (prefix) return prefix;
            }
            return "I've prepared some options for you — check below.";
        }
    }
    
    // Strip code blocks that contain json
    let cleaned = trimmed.replace(/```json\s*\{[\s\S]*\}\s*```/g, "I've prepared some options for you — check below.");
    cleaned = cleaned.replace(/```\s*\{[\s\S]*\}\s*```/g, "I've prepared some options for you — check below.");
    return cleaned;
}

import { motion } from 'framer-motion';

export function CoachMessageBubble({ message }: CoachMessageBubbleProps) {
    const isUser = message.role === 'user';
    const [showThinking, setShowThinking] = useState(false);
    const hasThinking = !isUser && message.thinking && message.thinking.length > 0;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
        >
            <div
                className={`max-w-[85%] md:max-w-[70%] px-6 py-5 rounded-[2rem] relative group ${isUser
                        ? 'bg-gradient-to-b from-[var(--color-primary)] to-[color-mix(in_oklab,_var(--color-primary)_70%,_black)] text-white ml-12 rounded-tr-md shadow-lg border border-[var(--color-primary)]/30 backdrop-blur-md'
                        : 'bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-border)] text-[var(--text-primary)] mr-12 rounded-tl-md shadow-2xl'
                    }`}
            >
                {/* Subtle inner reflection */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent opacity-[0.8] rounded-[2rem] pointer-events-none" />

                <div className="flex flex-col space-y-1 relative z-10">
                    {!isUser && (
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-soft)] flex items-center justify-center shadow-[0_0_10px_var(--color-primary-glow)]">
                                <Compass className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-overline text-[var(--color-primary)]">
                                Donna
                            </span>
                        </div>
                    )}
                    <div className={cn("text-sm leading-relaxed", isUser ? "font-medium" : "text-[var(--text-primary)]")}>
                        {isUser ? message.content : renderMarkdown(sanitizeContent(message.content || ''))}
                    </div>

                    {/* Thinking Steps — Collapsed by default */}
                    {hasThinking && (
                        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
                            <button
                                onClick={() => setShowThinking(!showThinking)}
                                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
                            >
                                <ChevronDown className={cn("w-3 h-3 transition-transform", !showThinking && "-rotate-90")} aria-hidden="true" />
                                Donna&apos;s Reasoning ({message.thinking!.length} steps)
                            </button>
                            {showThinking && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                                    className="mt-2 space-y-1 overflow-hidden"
                                >
                                    {message.thinking!.map((step, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                                            <span className="text-[var(--color-primary)]/60 font-mono mt-0.5 font-bold">{i + 1}.</span>
                                            <span>{step}</span>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* Context Used — Subtle badges */}
                    {!isUser && message.contextUsed && message.contextUsed.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[var(--glass-border)] flex flex-wrap gap-1.5">
                            {message.contextUsed.map((ctx, i) => (
                                <span
                                    key={i}
                                    className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-[var(--glass-bg)] text-[var(--text-tertiary)] border border-[var(--glass-border)]"
                                >
                                    {ctx}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
