'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassToggle, GlassSlider } from '@/components/ui/glass-toggle';
import {
    Settings as SettingsIcon,
    User,
    Clock,
    Shield,
    Database,
    LogOut,
    Download,
    Trash2,
    Moon,
    Sun,
    Loader2,
    Sparkles,
    Activity,
    ArrowLeft
} from 'lucide-react';
import type { Profile } from '@/types/database';

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const { profile, setProfile, updateProfile } = useUserStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [userEmail, setUserEmail] = useState('');
    const [aiUsage, setAiUsage] = useState<{ daily: number; monthly: number; limit: number } | null>(null);

    useEffect(() => {
        async function loadData() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setUserEmail(user.email || '');

            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (data) setProfile(data);

            // Fetch AI usage
            try {
                const usageRes = await fetch('/api/settings/ai-usage');
                const usageData = await usageRes.json();
                if (!usageData.error) {
                    setAiUsage(usageData);
                }
            } catch (err) {
                console.error('Failed to load AI usage stats', err);
            }

            setIsLoading(false);
        }

        loadData();
    }, [supabase, setProfile]);

    const handleUpdate = async (updates: Partial<Profile>) => {
        setIsSaving(true);
        updateProfile(updates);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id);
        }

        setIsSaving(false);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleExportData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch all user data
        const [profileData, goalsData, dumpsData, blocksData] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('goals').select('*').eq('user_id', user.id),
            supabase.from('brain_dumps').select('id, created_at, content').eq('user_id', user.id),
            supabase.from('schedule_blocks').select('*').eq('user_id', user.id),
        ]);

        const exportData = {
            profile: profileData.data,
            goals: goalsData.data,
            brainDumps: dumpsData.data,
            scheduleBlocks: blocksData.data,
            exportedAt: new Date().toISOString(),
        };

        // Download as JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plannrai-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDeleteAccount = async () => {
        if (!confirm('Are you sure you want to delete all your data? This cannot be undone.')) {
            return;
        }

        try {
            const res = await fetch('/api/auth/delete-account', {
                method: 'POST',
            });

            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error || 'Failed to delete account');
            }

            // Clear local storage and sign out locally
            localStorage.clear();
            await supabase.auth.signOut();

            // Force redirect to onboarding/login via hard reload to clear memory
            window.location.href = '/login';
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete account. Please try again.');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-sm text-[var(--color-text-muted)]">
                    Customize your experience
                </p>
            </div>

            {/* Profile */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <h2 className="font-medium">Profile</h2>
                </div>

                <GlassCard padding="md" className="space-y-4">
                    <div className="flex items-center gap-3 pb-4 border-b border-[var(--glass-border)]">
                        <div className="w-12 h-12 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center">
                            <User className="w-6 h-6 text-[var(--color-primary)]" />
                        </div>
                        <div>
                            <p className="font-medium">{profile?.preferred_name || profile?.full_name || userEmail}</p>
                            <p className="text-sm text-[var(--color-text-muted)]">
                                {userEmail}
                            </p>
                        </div>
                    </div>

                    {/* Editable Name Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                                What should I call you?
                            </label>
                            <input
                                type="text"
                                value={profile?.preferred_name || ''}
                                onChange={(e) => handleUpdate({ preferred_name: e.target.value })}
                                placeholder="e.g., Advay"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                            />
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                Used in greetings like "Good morning, {profile?.preferred_name || 'Friend'}"
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                                Full name
                            </label>
                            <input
                                type="text"
                                value={profile?.full_name || ''}
                                onChange={(e) => handleUpdate({ full_name: e.target.value })}
                                placeholder="Your full name"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                            />
                        </div>
                    </div>
                </GlassCard>
            </section>

            {/* Time & Constraints */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <h2 className="font-medium">Time & Constraints</h2>
                </div>

                <GlassCard padding="md" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] mb-2">
                                <Moon className="w-4 h-4" />
                                Sleep starts
                            </label>
                            <input
                                type="time"
                                value={profile?.sleep_start || '22:00'}
                                onChange={(e) => handleUpdate({ sleep_start: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-text-primary)]"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] mb-2">
                                <Sun className="w-4 h-4" />
                                Wake up
                            </label>
                            <input
                                type="time"
                                value={profile?.sleep_end || '07:00'}
                                onChange={(e) => handleUpdate({ sleep_end: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-text-primary)]"
                            />
                        </div>
                    </div>
                </GlassCard>
            </section>

            {/* Bio-Calibration Link */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <h2 className="font-medium">Bio-Calibration</h2>
                </div>
                <GlassCard padding="md" className="flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors" onClick={() => router.push('/app/settings/bio-calibration')}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="font-medium">Routines & Scans</p>
                            <p className="text-xs text-[var(--color-text-muted)]">Analyze posture and generate protocols</p>
                        </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 rotate-180 text-[var(--text-tertiary)]" />
                </GlassCard>
            </section>

            {/* AI Permissions */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <h2 className="font-medium">AI Permissions</h2>
                </div>

                <GlassCard padding="md" className="space-y-4">
                    <GlassToggle
                        checked={profile?.ai_can_suggest || false}
                        onChange={(checked) => handleUpdate({ ai_can_suggest: checked })}
                        label="Suggest strategies"
                        description="I can offer ideas when you're stuck"
                    />
                    <div className="border-t border-[var(--glass-border)]" />
                    <GlassToggle
                        checked={profile?.ai_can_analyze || false}
                        onChange={(checked) => handleUpdate({ ai_can_analyze: checked })}
                        label="Analyze patterns"
                        description="I can learn from your habits"
                    />
                    <div className="border-t border-[var(--glass-border)]" />
                    <GlassToggle
                        checked={profile?.ai_can_draft || false}
                        onChange={(checked) => handleUpdate({ ai_can_draft: checked })}
                        label="Draft proposals"
                        description="I can prepare adjustments for review"
                    />
                </GlassCard>
            </section>

            {/* AI Usage Stats */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                    <h2 className="font-medium">AI Usage</h2>
                </div>

                <GlassCard padding="md">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-[var(--color-text-secondary)] mb-1">Today</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-bold">{aiUsage?.daily || 0}</span>
                                <span className="text-xs text-[var(--color-text-muted)]">/ {aiUsage?.limit.toLocaleString() || '14,400'}</span>
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-[var(--color-text-secondary)] mb-1">This Month</p>
                            <p className="text-xl font-bold">{aiUsage?.monthly || 0}</p>
                        </div>
                    </div>
                </GlassCard>
            </section>

            {/* Data & Privacy */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <h2 className="font-medium">Data & Privacy</h2>
                </div>

                <GlassCard padding="md" className="space-y-3">
                    <GlassButton
                        variant="ghost"
                        onClick={handleExportData}
                        className="w-full justify-start"
                    >
                        <Download className="w-4 h-4" />
                        Export all my data
                    </GlassButton>

                    <div className="border-t border-[var(--glass-border)]" />

                    <GlassButton
                        variant="danger"
                        onClick={handleDeleteAccount}
                        className="w-full justify-start"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete all data
                    </GlassButton>
                </GlassCard>
            </section>

            {/* Sign Out */}
            <GlassButton
                variant="ghost"
                onClick={handleSignOut}
                className="w-full"
            >
                <LogOut className="w-4 h-4" />
                Sign out
            </GlassButton>

            {/* Version */}
            <p className="text-center text-xs text-[var(--color-text-muted)]">
                PlannrAI v1.0.0 · Your data is private
            </p>
        </div>
    );
}
