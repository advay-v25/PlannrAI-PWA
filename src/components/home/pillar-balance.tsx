'use client';

import { useMemo } from 'react';
import { Brain, Dumbbell, Wrench } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface PillarBalanceProps {
    blocks: any[];
}

const PILLAR_CONFIG = {
    mind: { label: 'Mind', icon: Brain, color: '#38bdf8' },   // sky-400
    body: { label: 'Body', icon: Dumbbell, color: '#34d399' }, // emerald-400
    craft: { label: 'Craft', icon: Wrench, color: '#fbbf24' }, // amber-400
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

        const maxMins = Math.max(1, ...Object.values(totals));

        return Object.entries(PILLAR_CONFIG).map(([key, config]) => ({
            key,
            ...config,
            minutes: totals[key],
            pct: Math.round((totals[key] / maxMins) * 100),
        }));
    }, [blocks]);

    const totalMins = pillarData.reduce((s, p) => s + p.minutes, 0);
    if (totalMins === 0) return null;

    return (
        <GlassCard className="p-4">
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
                Pillar Balance
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
                                <span className="text-[10px] font-mono font-bold" style={{ color: p.color }}>
                                    {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}
                                </span>
                            </div>
                            <div className="h-1.5 bg-[var(--glass-border)] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                    style={{
                                        width: `${p.pct}%`,
                                        backgroundColor: p.color,
                                        opacity: p.minutes > 0 ? 1 : 0.2,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}
