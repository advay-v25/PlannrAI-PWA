'use client';

import { motion } from 'framer-motion';
import { Fingerprint } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIProfileBadgeProps {
    aiProfile: {
        chronotype?: string;
        archetype?: string;
        energy_pattern?: string;
        donna_notes?: string[];
    } | null;
}

export function AIProfileBadge({ aiProfile }: AIProfileBadgeProps) {
    if (!aiProfile) return null;

    const { chronotype, archetype, energy_pattern, donna_notes } = aiProfile;
    if (!chronotype && !archetype) return null;

    // Pick an emoji based on chronotype
    const chronoEmoji = chronotype?.toLowerCase().includes('owl') ? '🦉'
        : chronotype?.toLowerCase().includes('lark') ? '🐦'
            : chronotype?.toLowerCase().includes('bear') ? '🐻'
                : '⚡';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-gradient-to-br from-[var(--color-primary)]/10 to-purple-500/5 p-6 backdrop-blur-xl"
        >
            {/* Ambient glow */}
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-[var(--color-primary)]/10 blur-[60px]" />

            <div className="relative z-10 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--glass-bg)] text-2xl">
                    {chronoEmoji}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Fingerprint className="h-3 w-3 text-[var(--color-primary)]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                            Your DNA
                        </span>
                    </div>

                    {archetype && (
                        <h4 className="text-lg font-semibold text-white leading-tight">
                            {archetype}
                        </h4>
                    )}

                    <div className="mt-1 flex flex-wrap gap-2">
                        {chronotype && (
                            <span className="rounded-full bg-[var(--glass-bg)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                                {chronotype}
                            </span>
                        )}
                        {energy_pattern && (
                            <span className="rounded-full bg-[var(--glass-bg)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                                {energy_pattern}
                            </span>
                        )}
                    </div>

                    {donna_notes && donna_notes.length > 0 && (
                        <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2 italic">
                            "{donna_notes[donna_notes.length - 1]}"
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
