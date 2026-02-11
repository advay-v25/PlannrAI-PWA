'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Sparkles } from 'lucide-react';

export function WisdomFeed() {
    return (
        <GlassCard className="p-6 flex items-center gap-4 bg-[var(--glass-bg)] border-[var(--glass-border)]">
            <div className="relative">
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                </div>
                {/* Pulse Animation */}
                <div className="absolute inset-0 rounded-full border-2 border-[var(--color-primary)] opacity-20 animate-ping" />
            </div>

            <div className="flex-1">
                <h4 className="text-sm font-bold text-[var(--text-primary)]">Wisdom Stream</h4>
                <p className="text-xs text-[var(--text-tertiary)]">
                    Gathering patterns from your activity...
                </p>
            </div>

            {/* Placeholder for future feed items */}
            <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest opacity-50">
                Listening
            </div>
        </GlassCard>
    );
}
