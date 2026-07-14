'use client';

import { useMemo } from 'react';
import { Brain, Dumbbell, Wrench } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface PillarBalanceProps {
    blocks: any[];
}

// Use the same CSS custom properties as Goals/Calendar so pillar colors
// are consistent across the whole app (single source of truth in globals.css).
const PILLAR_CONFIG = {
    mind: { label: 'Mind', icon: Brain, color: 'var(--color-mind)', glow: 'var(--color-mind-glow)', target: 60 },
    body: { label: 'Body', icon: Dumbbell, color: 'var(--color-body)', glow: 'var(--color-body-glow)', target: 60 },
    craft: { label: 'Craft', icon: Wrench, color: 'var(--color-craft)', glow: 'var(--color-craft-glow)', target: 180 },
};

export function PillarBalance({ blocks }: PillarBalanceProps) {
    const pillarData = useMemo(() => {
        const totals: Record<string, number> = { mind: 0, body: 0, craft: 0 };
        
        (blocks || []).forEach((b: any) => {
            const pillar = (b.pillar || b.goal?.pillar || b.block_type || '').toLowerCase();
            if (pillar in totals) {
                const [sh, sm] = (b.start_time || '00:00').split(':').map(Number);
                const [eh, em] = (b.end_time || '00:00').split(':').map(Number);
                totals[pillar] += Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
            }
        });

        return Object.entries(PILLAR_CONFIG).map(([key, config]) => {
            const minutes = totals[key] || 0;
            const pct = Math.min(100, Math.round((minutes / config.target) * 100));
            return {
                key,
                ...config,
                minutes,
                pct,
            };
        });
    }, [blocks]);

    const totalMins = pillarData.reduce((s, p) => s + p.minutes, 0);

    return (
        <GlassCard className="p-4">
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
                Pillar Balance — Today
            </h3>
            <div className="space-y-3">
                {pillarData.map((p) => {
                    const Icon = p.icon;
                    const hrs = Math.floor(p.minutes / 60);
                    const mins = p.minutes % 60;
                    return (
                        <div key={p.key} className="space-y-1">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Icon className="w-3.5 h-3.5" style={{ color: p.color }} />
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">{p.label}</span>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-[var(--text-secondary)]">
                                    <span style={{ color: p.color }}>{p.minutes}</span> / {p.target}m
                                </span>
                            </div>
                            <div className="h-5 bg-black/40 rounded-lg overflow-hidden relative border border-white/5">
                                <div
                                    className="absolute top-0 left-0 h-full transition-all duration-700 ease-out flex items-center justify-end"
                                    style={{
                                        width: p.pct > 0 ? `${Math.max(15, p.pct)}%` : '0%',
                                        backgroundColor: p.color,
                                        boxShadow: `0 0 10px ${p.glow}`,
                                    }}
                                >
                                    {p.pct > 0 && (
                                        <span className="text-[10px] font-bold text-black/70 pr-2">{p.pct}%</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}
