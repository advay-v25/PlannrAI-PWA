
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Loader2, Brain, Battery, Zap, Activity, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client'; // Assumes I'll add context to apiClient
import { format } from 'date-fns';

export function ContextDebugger() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchContext = async () => {
        setLoading(true);
        try {
            // Manual fetch if not in apiClient yet
            // Use apiClient to handle auth headers
            const res = await apiClient.get<any>('/api/ai/context');
            if (res) {
                setData(res);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContext();
    }, []);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-white/20" />
            </div>
        );
    }

    if (!data) return null;

    const { context, mode } = data;
    const { state, schedule, goals } = context;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Cortex State</h3>
                        <p className="text-xs text-[var(--text-tertiary)]">Live view of AI Context</p>
                    </div>
                </div>
                <button onClick={fetchContext} className="p-2 hover:bg-white/10 rounded-lg">
                    <RefreshCw className={`w-4 h-4 text-white/40 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatusCard
                    label="System Mode"
                    value={mode.toUpperCase()}
                    icon={Activity}
                    color="text-blue-400"
                />
                <StatusCard
                    label="Energy"
                    value={`${state.energy_level}/10`}
                    icon={Battery}
                    color="text-emerald-400"
                />
                <StatusCard
                    label="Focus Load"
                    value={`${Math.round(schedule.stats.total_focus_time / 60)}h`}
                    icon={Zap}
                    color="text-amber-400"
                />
                <StatusCard
                    label="Active Goals"
                    value={goals.active.length}
                    icon={Brain}
                    color="text-purple-400"
                />
            </div>

            <GlassCard padding="md" className="font-mono text-xs overflow-hidden">
                <div className="mb-2 text-[var(--text-tertiary)] uppercase tracking-wider font-bold">Raw JSON Snapshot</div>
                <pre className="text-[var(--text-secondary)] overflow-x-auto p-4 bg-black/20 rounded-xl">
                    {JSON.stringify(context, null, 2)}
                </pre>
            </GlassCard>
        </div>
    );
}

function StatusCard({ label, value, icon: Icon, color }: any) {
    return (
        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-2 mb-2 text-[var(--text-tertiary)]">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs uppercase tracking-wider font-bold">{label}</span>
            </div>
            <div className="text-2xl font-bold">{value}</div>
        </div>
    );
}
