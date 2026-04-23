'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import { LineChart, TrendingUp, Target, Trophy, Flame, BarChart3, PieChart, Calendar, Loader2 } from 'lucide-react';

const PILLAR_COLORS: Record<string, string> = {
    mind: '#818cf8',
    body: '#34d399',
    craft: '#f59e0b',
    anchor: '#f472b6',
    meal: '#a78bfa',
};

const PILLAR_LABELS: Record<string, string> = {
    mind: 'Mind',
    body: 'Body',
    craft: 'Craft',
    anchor: 'Anchors',
    meal: 'Meals',
};

export default function AnalyticsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(30);

    useEffect(() => {
        loadData();
    }, [period]);

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await apiClient.get<any>(`/api/analytics/overview?days=${period}`);
            setData(result);
        } catch (e) {
            console.error('Analytics load failed:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex h-[60vh] items-center justify-center text-white/40">
                Failed to load analytics.
            </div>
        );
    }

    const { summary, adherence_trend, pillar_distribution, weekday_pattern } = data;

    // Calculate max for chart scaling
    const maxPlanned = Math.max(...adherence_trend.map((d: any) => d.planned), 1);

    // Pillar total for percentage calc
    const totalPillarMin = pillar_distribution.reduce((s: number, p: any) => s + p.minutes, 0);

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Analytics</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Your patterns, trends, and progress.</p>
                </div>
                <div className="flex gap-2">
                    {[7, 14, 30].map(d => (
                        <button
                            key={d}
                            onClick={() => setPeriod(d)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                period === d
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : 'bg-white/5 text-white/40 hover:text-white/60'
                            }`}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    icon={<Target className="w-4 h-4 text-orange-400" />}
                    label="Adherence"
                    value={`${summary.overall_adherence}%`}
                    sublabel={`${summary.active_days} active days`}
                />
                <StatCard
                    icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                    label="Completed"
                    value={`${summary.total_completed_hours}h`}
                    sublabel={`of ${summary.total_planned_hours}h planned`}
                />
                <StatCard
                    icon={<Flame className="w-4 h-4 text-red-400" />}
                    label="Streak"
                    value={`${summary.current_streak}`}
                    sublabel="consecutive days"
                />
                <StatCard
                    icon={<Trophy className="w-4 h-4 text-purple-400" />}
                    label="Goals"
                    value={`${summary.goals_count}`}
                    sublabel="active goals"
                />
            </div>

            {/* Adherence Trend Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
            >
                <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-4 h-4 text-orange-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">Daily Adherence</h3>
                </div>

                {adherence_trend.length === 0 ? (
                    <p className="text-sm text-white/30 text-center py-8">No schedule data yet for this period.</p>
                ) : (
                    <div className="h-48 flex items-end gap-[2px]">
                        {adherence_trend.map((day: any, i: number) => {
                            const plannedH = (day.planned / maxPlanned) * 100;
                            const completedH = (day.completed / maxPlanned) * 100;
                            return (
                                <div
                                    key={day.date}
                                    className="flex-1 flex flex-col items-center gap-1 group relative"
                                >
                                    {/* Tooltip */}
                                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                        <div className="font-bold">{day.date}</div>
                                        <div className="text-white/50">{Math.round(day.completed)}m / {Math.round(day.planned)}m</div>
                                    </div>
                                    {/* Planned bar (background) */}
                                    <div className="w-full flex flex-col items-center" style={{ height: '100%' }}>
                                        <div className="w-full mt-auto relative rounded-t-sm overflow-hidden" style={{ height: `${plannedH}%`, minHeight: '2px' }}>
                                            <div className="absolute inset-0 bg-white/10" />
                                            <motion.div
                                                initial={{ height: 0 }}
                                                animate={{ height: `${day.planned > 0 ? (day.completed / day.planned) * 100 : 0}%` }}
                                                transition={{ duration: 0.5, delay: i * 0.02 }}
                                                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-orange-500 to-yellow-400 rounded-t-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center gap-4 mt-4 text-[10px] text-white/40">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-white/10" />
                        <span>Planned</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-gradient-to-t from-orange-500 to-yellow-400" />
                        <span>Completed</span>
                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pillar Distribution */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <PieChart className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">Pillar Distribution</h3>
                    </div>

                    {pillar_distribution.length === 0 ? (
                        <p className="text-sm text-white/30 text-center py-6">No data yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {pillar_distribution.sort((a: any, b: any) => b.minutes - a.minutes).map((p: any) => {
                                const percent = totalPillarMin > 0 ? Math.round((p.minutes / totalPillarMin) * 100) : 0;
                                const color = PILLAR_COLORS[p.pillar] || '#6b7280';
                                return (
                                    <div key={p.pillar}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-semibold text-white/70">{PILLAR_LABELS[p.pillar] || p.pillar}</span>
                                            <span className="text-xs text-white/40 font-mono">{Math.round(p.minutes / 60)}h {p.minutes % 60}m · {percent}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${percent}%` }}
                                                transition={{ duration: 0.8, delay: 0.3 }}
                                                className="h-full rounded-full"
                                                style={{ backgroundColor: color }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                {/* Weekday Pattern */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Calendar className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">Weekday Pattern</h3>
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                        {weekday_pattern.map((d: any) => {
                            const intensity = d.adherence;
                            let bgColor = 'bg-white/5';
                            if (intensity > 75) bgColor = 'bg-emerald-500/30';
                            else if (intensity > 50) bgColor = 'bg-emerald-500/20';
                            else if (intensity > 25) bgColor = 'bg-yellow-500/20';
                            else if (intensity > 0) bgColor = 'bg-red-500/15';

                            return (
                                <div key={d.day} className="flex flex-col items-center gap-2">
                                    <span className="text-[10px] text-white/40 font-bold uppercase">{d.day}</span>
                                    <div className={`w-full aspect-square rounded-xl ${bgColor} flex items-center justify-center`}>
                                        <span className="text-xs font-bold text-white/60">{d.adherence}%</span>
                                    </div>
                                    <span className="text-[9px] text-white/30 font-mono">{d.avgCompleted}m</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-center gap-3 mt-4 text-[9px] text-white/30">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red-500/15" />0-25%</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-yellow-500/20" />25-50%</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-500/20" />50-75%</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-500/30" />75%+</div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, sublabel }: { icon: React.ReactNode; label: string; value: string; sublabel: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
        >
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-[10px] text-white/30 mt-0.5">{sublabel}</div>
        </motion.div>
    );
}
