'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Activity, Brain, Radio, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface IntelligenceHeartbeatProps {
    context: {
        computedMode: 'focus' | 'recovery' | 'maintenance' | 'survival';
        energyCapacity: number;
        densityLimit: number;
        userContext: any[];
    } | null;
    isSyncing?: boolean;
}

export function IntelligenceHeartbeat({ context, isSyncing }: IntelligenceHeartbeatProps) {
    const [streamedText, setStreamedText] = useState("");
    const fullText = context?.userContext?.[0]?.content || "System observational mode active. Awaiting signals...";

    // Typewriter effect for intelligence text
    useEffect(() => {
        if (!fullText) return;
        setStreamedText("");
        let i = 0;
        const interval = setInterval(() => {
            setStreamedText(prev => prev + fullText.charAt(i));
            i++;
            if (i >= fullText.length) clearInterval(interval);
        }, 20); // Fast typing
        return () => clearInterval(interval);
    }, [fullText]);

    const modeColors = {
        focus: 'text-[var(--color-primary)] shadow-[0_0_10px_rgba(255,77,0,0.4)]',
        recovery: 'text-[var(--color-body)] shadow-[0_0_10px_rgba(16,185,129,0.4)]',
        maintenance: 'text-[var(--color-mind)] shadow-[0_0_10px_rgba(139,92,246,0.4)]',
        survival: 'text-[var(--color-warning)] shadow-[0_0_10px_rgba(255,160,0,0.4)]'
    };

    return (
        <GlassCard className="mt-8 border-[var(--glass-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]">
                <div className="flex items-center gap-2">
                    <Activity className={`w-3 h-3 ${isSyncing ? 'text-[var(--color-primary)] animate-pulse' : 'text-[var(--text-tertiary)]'}`} />
                    <span className="text-[10px] uppercase tracking-widest font-mono text-[var(--text-secondary)]">
                        Neural Feed {isSyncing ? '[SYNCING]' : '[LIVE]'}
                    </span>
                </div>
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[var(--glass-border)]" />
                    <div className="w-2 h-2 rounded-full bg-[var(--glass-border)]" />
                </div>
            </div>

            <div className="p-4 grid md:grid-cols-4 gap-6">

                {/* 1. Status Module */}
                <div className="md:col-span-1 space-y-4 border-r border-[var(--glass-border)] pr-4">
                    <div>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase mb-1">Current State</p>
                        <div className={`text-lg font-bold uppercase tracking-wide inline-block px-3 py-1 rounded bg-[var(--glass-bg)] ${context ? modeColors[context.computedMode] : 'text-[var(--text-secondary)]'}`}>
                            {context?.computedMode || "OFFLINE"}
                        </div>
                    </div>
                </div>

                {/* 2. Stream Feed */}
                <div className="md:col-span-3 font-mono text-sm relative min-h-[80px]">
                    <div className="absolute top-0 left-0 text-[var(--color-primary)] opacity-20">
                        <Brain className="w-24 h-24" />
                    </div>

                    <div className="relative z-10 space-y-2">
                        <div className="flex gap-2">
                            <span className="text-[var(--color-primary)] opacity-50">{'>'}</span>
                            <span className="text-[var(--text-primary)] leading-relaxed">
                                {streamedText}
                                <span className="inline-block w-2 h-4 bg-[var(--color-primary)] animate-pulse ml-1 align-middle" />
                            </span>
                        </div>

                        {/* Metadata / Footer of feed */}
                        <div className="pt-2 flex items-center gap-4 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                            <span className="flex items-center gap-1">
                                <Radio className="w-3 h-3" />
                                Latency: 12ms
                            </span>
                            {context?.userContext?.[0]?.confidence && (
                                <span className="flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Confidence: {(context.userContext[0].confidence * 100).toFixed(0)}%
                                </span>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </GlassCard>
    );
}
