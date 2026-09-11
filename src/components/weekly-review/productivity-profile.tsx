'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Clock, Target, Sun, Moon, Sunrise, Sunset, SunMedium } from 'lucide-react';

interface WindowStat {
    start: string;
    end: string;
    completion_rate: number;
}

export interface ProfileAnalysis {
    archetype: string;
    description: string;
    peak_window: WindowStat | null;
    low_window: WindowStat | null;
    /** Always 7 entries, Monday → Sunday, in calendar order. */
    day_patterns: { day: string; rate: number | null; blocks: number; is_future?: boolean }[];
    /** Always Mind, Body, Craft in that order. */
    pillar_insights: { pillar: string; completion_rate: number | null }[];
    overall_completion_rate: number;
    data_points: number;
}

const ARCHETYPE_GRADIENTS: Record<string, string> = {
    'Early Riser': 'from-sky-500/20 to-amber-400/20',
    'Morning Sprinter': 'from-amber-500/20 to-orange-500/20',
    'Afternoon Builder': 'from-blue-500/20 to-cyan-500/20',
    'Evening Operator': 'from-violet-500/20 to-indigo-500/20',
    'Night Owl': 'from-indigo-600/20 to-slate-600/20',
    'Still Learning': 'from-slate-500/15 to-slate-400/10',
};

/**
 * One icon per archetype. `Moon` belongs to Night Owl (a peak at 20:00 or
 * later) and must never appear for any other — an Evening Operator peaking at
 * 16:00–18:00 is late afternoon, not night.
 */
const ARCHETYPE_ICONS: Record<string, { Icon: any; className: string }> = {
    'Early Riser': { Icon: Sunrise, className: 'text-sky-400' },
    'Morning Sprinter': { Icon: Sun, className: 'text-amber-400' },
    'Afternoon Builder': { Icon: SunMedium, className: 'text-cyan-400' },
    'Evening Operator': { Icon: Sunset, className: 'text-orange-400' },
    'Night Owl': { Icon: Moon, className: 'text-indigo-400' },
    'Still Learning': { Icon: Target, className: 'text-[var(--text-tertiary)]' },
};

function ArchetypeIcon({ archetype }: { archetype: string }) {
    const { Icon, className } = ARCHETYPE_ICONS[archetype] || ARCHETYPE_ICONS['Still Learning'];
    return <Icon className={`w-6 h-6 ${className}`} />;
}

const rateColor = (rate: number) =>
    rate >= 70 ? 'text-emerald-400' : rate >= 40 ? 'text-amber-400' : 'text-red-400';

export default function ProductivityProfile({
    profile,
    loading = false,
}: {
    profile: ProfileAnalysis | null;
    loading?: boolean;
}) {
    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 w-48 bg-[var(--glass-border)] rounded-md" />
                <div className="space-y-4">
                    <div className="h-24 w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl" />
                    <div className="h-24 w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl" />
                </div>
            </div>
        );
    }

    if (!profile || profile.data_points < 5) {
        return (
            <div className="space-y-4">
                <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                        Productivity Profile
                    </h2>
                    <p className="text-sm text-[var(--text-tertiary)] mt-1">
                        From {profile?.data_points ?? 0} blocks this week
                    </p>
                </div>
                <div className="text-center py-12 border border-[var(--glass-border)] rounded-2xl bg-[var(--glass-bg)]">
                    <Target className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-tertiary)]">Not enough data yet</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                        Mark blocks as you go and your profile fills in here
                    </p>
                </div>
            </div>
        );
    }

    const hasWindows = !!profile.peak_window && !!profile.low_window;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                    Productivity Profile
                </h2>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    From {profile.data_points} blocks this week
                </p>
            </div>

            {/* Archetype */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border border-white/10 bg-gradient-to-br ${
                    ARCHETYPE_GRADIENTS[profile.archetype] || 'from-violet-500/20 to-cyan-500/20'
                } p-6`}
            >
                <div className="flex items-center gap-3 mb-3">
                    <ArchetypeIcon archetype={profile.archetype} />
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">{profile.archetype}</h3>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{profile.description}</p>
            </motion.div>

            {/* Time windows — genuine, non-overlapping rolling 2-hour ranges */}
            {hasWindows ? (
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                        <div className="flex items-center gap-1.5 mb-2 text-emerald-400">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Peak Window</span>
                        </div>
                        <div className="text-lg font-bold text-[var(--text-primary)]">
                            {profile.peak_window!.start} – {profile.peak_window!.end}
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {profile.peak_window!.completion_rate}% completion rate
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                        <div className="flex items-center gap-1.5 mb-2 text-orange-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Low Window</span>
                        </div>
                        <div className="text-lg font-bold text-[var(--text-primary)]">
                            {profile.low_window!.start} – {profile.low_window!.end}
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {profile.low_window!.completion_rate}% completion rate
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                        Time Windows
                    </div>
                    <p className="text-sm text-[var(--text-tertiary)]">Not enough data yet</p>
                </div>
            )}

            {/* Overall completion — the headline the panel builds toward */}
            <div className="p-5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Week Completion
                </div>
                <div
                    className={`text-5xl font-black tracking-tighter mt-1 ${rateColor(
                        profile.overall_completion_rate
                    )}`}
                >
                    {profile.overall_completion_rate}%
                </div>
            </div>

            {/* Day patterns — all seven days, Monday first, calendar order */}
            <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Day Patterns
                </h4>
                <div className="space-y-2">
                    {profile.day_patterns.map((d) => (
                        <div key={d.day} className="flex items-center justify-between">
                            <span
                                className={`text-sm ${
                                    d.is_future ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
                                }`}
                            >
                                {d.day}
                            </span>
                            <div className="flex items-center gap-2">
                                <div className="w-32 h-2 rounded-full bg-[var(--glass-border)] overflow-hidden">
                                    {/* A day still to come has no bar at all — it has
                                        not had its chance yet. */}
                                    {d.rate !== null && !d.is_future && (
                                        <div
                                            className={`h-full rounded-full ${
                                                d.rate >= 70
                                                    ? 'bg-emerald-500'
                                                    : d.rate >= 40
                                                      ? 'bg-amber-500'
                                                      : 'bg-red-500'
                                            }`}
                                            style={{ width: `${d.rate}%` }}
                                        />
                                    )}
                                </div>
                                <span
                                    className={`text-xs font-bold w-10 text-right ${
                                        d.rate === null || d.is_future
                                            ? 'text-[var(--text-muted)]'
                                            : rateColor(d.rate)
                                    }`}
                                >
                                    {d.rate === null || d.is_future ? '—' : `${d.rate}%`}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pillar performance — Mind, Body, Craft. No general bucket. */}
            <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Pillar Performance
                </h4>
                <div className="grid grid-cols-3 gap-3">
                    {profile.pillar_insights.map((p) => (
                        <div key={p.pillar} className="text-center">
                            <div
                                className={`text-2xl font-black ${
                                    p.completion_rate === null
                                        ? 'text-[var(--text-muted)]'
                                        : rateColor(p.completion_rate)
                                }`}
                            >
                                {p.completion_rate === null ? '—' : `${p.completion_rate}%`}
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">
                                {p.pillar}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
