'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { GlassCard } from '@/components/ui/glass-card';
import { Brain, Dumbbell, Briefcase } from 'lucide-react';

interface PillarBalanceProps {
    plannedMinutes: { mind: number; body: number; craft: number };
    completedMinutes: { mind: number; body: number; craft: number };
}

export function PillarBalance({ plannedMinutes, completedMinutes }: PillarBalanceProps) {
    const data = useMemo(() => [
        { name: 'Mind', value: plannedMinutes.mind, completed: completedMinutes.mind, color: 'var(--color-mind)', icon: Brain },
        { name: 'Body', value: plannedMinutes.body, completed: completedMinutes.body, color: 'var(--color-body)', icon: Dumbbell },
        { name: 'Craft', value: plannedMinutes.craft, completed: completedMinutes.craft, color: 'var(--color-primary)', icon: Briefcase },
    ], [plannedMinutes, completedMinutes]);

    const totalPlanned = data.reduce((acc, curr) => acc + curr.value, 0) || 1;

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            const Icon = d.icon;
            return (
                <div className="glass-card p-2 text-xs border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md">
                    <div className="flex items-center gap-2 font-bold mb-1" style={{ color: d.color }}>
                        <Icon className="w-3 h-3" />
                        {d.name}
                    </div>
                    <div className="text-[var(--text-secondary)]">
                        Planned: {Math.round(d.value)}m
                    </div>
                    <div className="text-[var(--text-tertiary)]">
                        Done: {Math.round(d.completed)}m
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <GlassCard className="p-4 border-[var(--glass-border)] bg-[var(--glass-bg)] h-full min-h-[200px] flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-2 px-1">
                Pillar Balance
            </h3>

            <div className="flex-1 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={60}
                            paddingAngle={5}
                            stroke="none"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ResponsiveContainer>

                {/* Center Stats */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Total</span>
                    <span className="text-xl font-bold font-mono text-[var(--text-primary)]">
                        {Math.round(totalPlanned / 60)}h
                    </span>
                </div>
            </div>

            {/* Legend */}
            <div className="flex justify-around mt-2">
                {data.map(d => (
                    <div key={d.name} className="flex flex-col items-center">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase" style={{ color: d.color }}>
                            <d.icon className="w-3 h-3" />
                            {d.name}
                        </div>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                            {Math.round((d.value / totalPlanned) * 100)}%
                        </span>
                    </div>
                ))}
            </div>
        </GlassCard>
    );
}
