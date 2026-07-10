'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Clock, Zap, Target, Sun, Moon, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface ProfileAnalysis {
    archetype: string;
    description: string;
    peak_window: { start: string; end: string; completion_rate: number };
    low_window: { start: string; end: string; completion_rate: number };
    best_days: { day: string; rate: number }[];
    worst_day: { day: string; rate: number } | null;
    pillar_insights: { pillar: string; completion_rate: number }[];
    data_points: number;
}

export default function ProductivityProfile() {
    const [profile, setProfile] = useState<ProfileAnalysis | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const res = await apiClient.get<{ profile: ProfileAnalysis }>('/api/settings/profile-analysis');
            setProfile(res.profile);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 w-48 bg-[var(--glass-border)] rounded-md"></div>
                <div className="space-y-4">
                    <div className="h-24 w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl"></div>
                    <div className="h-24 w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl"></div>
                </div>
            </div>
        );
    }

    if (!profile || profile.data_points < 5) {
        return (
            <div className="space-y-4">
                <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Productivity Profile</h2>
                    <p className="text-sm text-[var(--text-tertiary)] mt-1">AI-generated from your patterns</p>
                </div>
                <div className="text-center py-12 border border-[var(--glass-border)] rounded-2xl bg-[var(--glass-bg)]">
                    <Target className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-tertiary)]">Not enough data yet</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Complete more blocks to unlock your productivity profile</p>
                </div>
            </div>
        );
    }

    const archetypeColors: Record<string, string> = {
        'Morning Sprinter': 'from-amber-500/20 to-orange-500/20',
        'Afternoon Warrior': 'from-blue-500/20 to-cyan-500/20',
        'Evening Owl': 'from-violet-500/20 to-indigo-500/20',
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Productivity Profile</h2>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">AI-generated from {profile.data_points} data points</p>
            </div>

            {/* Archetype Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border border-white/10 bg-gradient-to-br ${archetypeColors[profile.archetype] || 'from-violet-500/20 to-cyan-500/20'} p-6`}
            >
                <div className="flex items-center gap-3 mb-3">
                    {profile.archetype.includes('Morning') && <Sun className="w-6 h-6 text-amber-400" />}
                    {profile.archetype.includes('Afternoon') && <Zap className="w-6 h-6 text-cyan-400" />}
                    {profile.archetype.includes('Evening') && <Moon className="w-6 h-6 text-violet-400" />}
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">{profile.archetype}</h3>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{profile.description}</p>
            </motion.div>

            {/* Time Patterns */}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                    <div className="flex items-center gap-1.5 mb-2 text-emerald-400">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Peak Window</span>
                    </div>
                    <div className="text-lg font-bold text-[var(--text-primary)]">{profile.peak_window.start} - {profile.peak_window.end}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{profile.peak_window.completion_rate}% completion rate</div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                    <div className="flex items-center gap-1.5 mb-2 text-orange-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Low Window</span>
                    </div>
                    <div className="text-lg font-bold text-[var(--text-primary)]">{profile.low_window.start} - {profile.low_window.end}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{profile.low_window.completion_rate}% completion rate</div>
                </div>
            </div>

            {/* Day Patterns */}
            <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Day Patterns</h4>
                <div className="space-y-2">
                    {profile.best_days.map(d => (
                        <div key={d.day} className="flex items-center justify-between">
                            <span className="text-sm text-[var(--text-secondary)] capitalize">{d.day}</span>
                            <div className="flex items-center gap-2">
                                <div className="w-32 h-2 rounded-full bg-[var(--glass-border)] overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${d.rate}%` }} />
                                </div>
                                <span className="text-xs text-emerald-400 font-bold w-10 text-right">{d.rate}%</span>
                            </div>
                        </div>
                    ))}
                    {profile.worst_day && (
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--text-secondary)] capitalize">{profile.worst_day.day}</span>
                            <div className="flex items-center gap-2">
                                <div className="w-32 h-2 rounded-full bg-[var(--glass-border)] overflow-hidden">
                                    <div className="h-full rounded-full bg-red-500" style={{ width: `${profile.worst_day.rate}%` }} />
                                </div>
                                <span className="text-xs text-red-400 font-bold w-10 text-right">{profile.worst_day.rate}%</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Pillar Insights */}
            {profile.pillar_insights.length > 0 && (
                <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-3">
                    <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Pillar Performance</h4>
                    <div className="grid grid-cols-3 gap-3">
                        {profile.pillar_insights.map(p => (
                            <div key={p.pillar} className="text-center">
                                <div className={`text-2xl font-black ${p.completion_rate >= 70 ? 'text-emerald-400' :
                                        p.completion_rate >= 40 ? 'text-amber-400' : 'text-red-400'
                                    }`}>{p.completion_rate}%</div>
                                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">{p.pillar}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
