'use client';

import { useState } from 'react';
import { CoachMessage } from '@/hooks/use-coach';


interface CoachMessageBubbleProps {
    message: CoachMessage;
}

/**
 * Render basic markdown: **bold**, *italic*, `code`, line breaks, and bullet lists.
 * Returns an array of React elements.
 */
function renderMarkdown(text: string): React.ReactNode[] {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, lineIdx) => {
        // Detect bullet points
        const bulletMatch = line.match(/^\s*[-•]\s+(.*)/);
        if (bulletMatch) {
            elements.push(
                <div key={lineIdx} className="flex items-start gap-1.5 pl-1">
                    <span className="text-primary/60 mt-0.5 text-[10px]">•</span>
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
                    <span className="text-primary/60 font-bold text-[10px] mt-0.5 min-w-[14px]">{numberedMatch[1]}.</span>
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
            parts.push(<strong key={match.index} className="font-bold text-foreground">{match[2]}</strong>);
        } else if (match[3]) {
            // *italic*
            parts.push(<em key={match.index} className="italic text-foreground/80">{match[3]}</em>);
        } else if (match[4]) {
            // `code`
            parts.push(
                <code key={match.index} className="text-[10px] px-1 py-0.5 rounded bg-white/10 text-primary font-mono">
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

export function CoachMessageBubble({ message }: CoachMessageBubbleProps) {
    const isUser = message.role === 'user';
    const [showThinking, setShowThinking] = useState(false);
    const hasThinking = !isUser && message.thinking && message.thinking.length > 0;

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div
                className={`max-w-[85%] px-5 py-4 rounded-3xl shadow-sm relative overflow-hidden group ${isUser
                        ? 'bg-gradient-to-tr from-purple-600/90 to-orange-500/90 backdrop-blur-md border border-white/20 text-white ml-12 rounded-tr-sm shadow-[0_8px_32px_rgba(249,115,22,0.25)]'
                        : 'bg-black/60 backdrop-blur-xl border border-white/10 border-l-2 border-l-purple-500 shadow-[0_8px_32px_rgba(168,85,247,0.15)] text-foreground mr-12 rounded-tl-sm'
                    }`}
            >
                {/* Subtle inner reflection */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50 pointer-events-none" />
                
                <div className="flex flex-col space-y-1 relative z-10">
                    {!isUser && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80 mb-1">
                            Donna · Strategic Lead
                        </span>
                    )}
                    <div className="text-sm leading-relaxed">
                        {isUser ? message.content : renderMarkdown(sanitizeContent(message.content))}
                    </div>

                    {/* Thinking Steps — Collapsed by default */}
                    {hasThinking && (
                        <div className="mt-2 pt-2 border-t border-white/5">
                            <button
                                onClick={() => setShowThinking(!showThinking)}
                                className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-foreground/30 hover:text-foreground/50 transition-colors"
                            >
                                <span className="text-[10px]">{showThinking ? '▾' : '▸'}</span>
                                Donna&apos;s Reasoning ({message.thinking!.length} steps)
                            </button>
                            {showThinking && (
                                <div className="mt-1.5 space-y-1 animate-fade-in">
                                    {message.thinking!.map((step, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-foreground/40">
                                            <span className="text-primary/40 font-mono mt-0.5">{i + 1}.</span>
                                            <span>{step}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Context Used — Subtle badges */}
                    {!isUser && message.contextUsed && message.contextUsed.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {message.contextUsed.map((ctx, i) => (
                                <span
                                    key={i}
                                    className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/5 text-foreground/25 border border-white/5"
                                >
                                    {ctx}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
