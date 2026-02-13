'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserStore } from '@/stores';
import { useToast } from '@/components/ui/toast';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassToggle } from '@/components/ui/glass-toggle';
import { UsageGauge } from '@/components/settings/usage-gauge';
import {
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
    Activity,
    ArrowLeft,
    ChevronRight,
    Smartphone,
    CreditCard
} from 'lucide-react';
import type { Profile } from '@/types/database';
import { apiClient } from '@/lib/api-client';

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const { showToast } = useToast();
    const { profile, setProfile, updateProfile } = useUserStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [userEmail, setUserEmail] = useState('');
    const [aiUsage, setAiUsage] = useState<{ daily: number; monthly: number; limit: number } | null>(null);

    // Local state for debounced inputs
    const [localPreferredName, setLocalPreferredName] = useState('');
    const [localFullName, setLocalFullName] = useState('');

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

            if (data) {
                setProfile(data);
                setLocalPreferredName(data.preferred_name || '');
                setLocalFullName(data.full_name || '');
            }

            // Fetch AI usage
            try {
                const usageData = await apiClient.get<any>('/api/settings/ai-usage');
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
        showToast('✅ Saved', 'success');
    };

    const handleSignOut = async () => {
        setIsSigningOut(true);
        showToast('👋 Signing out...', 'info');
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
            supabase.from('brain_dump_entries').select('id, created_at, raw_text').eq('user_id', user.id),
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
        showToast('📦 Data exported!', 'success');
    };

    const handleDeleteAccount = async () => {
        if (!confirm('Are you sure you want to delete all your data? This cannot be undone.')) {
            return;
        }

        try {
            await apiClient.post('/api/auth/delete-account', {});

            // Clear local storage and sign out locally
            localStorage.clear();
            await supabase.auth.signOut();

            // Force redirect to onboarding/login via hard reload to clear memory
            window.location.href = '/login';
        } catch (error) {
            console.error('Delete failed:', error);
            showToast('Failed to delete account', 'error');
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
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Control Center</h1>
                <p className="text-sm text-[var(--color-text-muted)]">
                    System configuration and neural calibration
                </p>
            </div>

            {/* AI Capacity Gauge */}
            <section>
                <div className="flex items-center gap-2 px-1 mb-2">
                    <Activity className="w-3 h-3 text-[var(--color-primary)]" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">System Load</h2>
                </div>
                <UsageGauge
                    daily={aiUsage?.daily || 0}
                    limit={aiUsage?.limit || 14400}
                    monthly={aiUsage?.monthly}
                />
            </section>

            {/* Pilot Profile */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <User className="w-3 h-3 text-[var(--color-primary)]" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Pilot Identity</h2>
                </div>
                <GlassCard padding="none" className="overflow-hidden">
                    <div className="p-6 flex items-center gap-5 border-b border-white/5 bg-gradient-to-r from-[var(--color-primary)]/5 to-transparent">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--glass-bg-hover)] border border-white/10 flex items-center justify-center shadow-inner">
                            <span className="text-2xl font-bold text-[var(--color-primary)]">
                                {(profile?.preferred_name?.[0] || userEmail?.[0] || '?').toUpperCase()}
                            </span>
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-bold text-white">
                                {profile?.preferred_name || 'Pilot'}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] bg-white/5 px-2 py-1 rounded-md w-fit">
                                <CreditCard className="w-3 h-3" />
                                <span>Free Tier Plan</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 grid gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                                    Call Sign
                                </label>
                                <input
                                    type="text"
                                    value={localPreferredName}
                                    onChange={(e) => setLocalPreferredName(e.target.value)}
                                    onBlur={() => {
                                        if (localPreferredName !== (profile?.preferred_name || '')) {
                                            handleUpdate({ preferred_name: localPreferredName });
                                        }
                                    }}
                                    placeholder="e.g. Maverick"
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-white focus:border-[var(--color-primary)]/50 focus:bg-[var(--glass-bg-hover)] transition-all outline-none text-sm font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                                    Full Designation
                                </label>
                                <input
                                    type="text"
                                    value={localFullName}
                                    onChange={(e) => setLocalFullName(e.target.value)}
                                    onBlur={() => {
                                        if (localFullName !== (profile?.full_name || '')) {
                                            handleUpdate({ full_name: localFullName });
                                        }
                                    }}
                                    placeholder="Full Name"
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-white focus:border-[var(--color-primary)]/50 focus:bg-[var(--glass-bg-hover)] transition-all outline-none text-sm font-medium"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                                Comm Link (Email)
                            </label>
                            <input
                                type="text"
                                value={userEmail}
                                disabled
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-[var(--text-tertiary)] text-sm cursor-not-allowed"
                            />
                        </div>
                    </div>
                </GlassCard>
            </section>

            {/* System Calibration */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Clock className="w-3 h-3 text-[var(--color-primary)]" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">System Calibration</h2>
                </div>

                <div className="grid gap-4">
                    <GlassCard padding="lg" className="hover:border-[var(--color-primary)]/20 transition-colors">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                                    <Moon className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold">Circadian Rhythm</h3>
                                    <p className="text-xs text-[var(--text-tertiary)]">Define your operational window</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-medium text-[var(--text-tertiary)]">Wake Protocol</label>
                                <input
                                    type="time"
                                    value={profile?.sleep_end || '07:00'}
                                    onChange={(e) => handleUpdate({ sleep_end: e.target.value })}
                                    className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-medium text-[var(--text-tertiary)]">Sleep Protocol</label>
                                <input
                                    type="time"
                                    value={profile?.sleep_start || '22:00'}
                                    onChange={(e) => handleUpdate({ sleep_start: e.target.value })}
                                    className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] outline-none"
                                />
                            </div>
                        </div>
                    </GlassCard>

                    <GlassCard
                        padding="md"
                        className="flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all group"
                        onClick={() => router.push('/app/settings/bio-calibration')}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:border-emerald-500/40 transition-colors">
                                <Activity className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">Bio-Scans & Routines</h3>
                                <p className="text-xs text-[var(--text-tertiary)]">Configure posture analysis and recovery protocols</p>
                            </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:translate-x-1 transition-transform" />
                    </GlassCard>
                </div>
            </section>

            {/* Neural Agency */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Shield className="w-3 h-3 text-[var(--color-primary)]" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Neural Permissions</h2>
                </div>

                <GlassCard padding="none" className="divide-y divide-white/5">
                    <div className="p-4">
                        <GlassToggle
                            checked={profile?.ai_can_suggest || false}
                            onChange={(checked) => handleUpdate({ ai_can_suggest: checked })}
                            label="Proactive Intervention"
                            description="AI can suggest changes without being asked"
                        />
                    </div>
                    <div className="p-4">
                        <GlassToggle
                            checked={profile?.ai_can_analyze || false}
                            onChange={(checked) => handleUpdate({ ai_can_analyze: checked })}
                            label="Deep Pattern Analysis"
                            description="Allow efficient learning across modules"
                        />
                    </div>
                    <div className="p-4">
                        <GlassToggle
                            checked={profile?.ai_can_draft || false}
                            onChange={(checked) => handleUpdate({ ai_can_draft: checked })}
                            label="Auto-Drafting"
                            description="AI can prepare schedule mutations for review"
                        />
                    </div>
                </GlassCard>
            </section>

            {/* Data & Privacy */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Database className="w-3 h-3 text-[var(--color-primary)]" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Data Governance</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <GlassCard padding="md" className="space-y-4 flex flex-col justify-between">
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold">Export Data</h3>
                            <p className="text-xs text-[var(--text-tertiary)]">Download a JSON archive of your neural state.</p>
                        </div>
                        <GlassButton
                            variant="ghost"
                            onClick={handleExportData}
                            className="w-full justify-center"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Download Archive
                        </GlassButton>
                    </GlassCard>

                    <GlassCard padding="md" className="space-y-4 flex flex-col justify-between border-red-500/10 bg-red-500/5">
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-red-200">Danger Zone</h3>
                            <p className="text-xs text-red-200/60">Permanently delete your account and all data.</p>
                        </div>
                        <GlassButton
                            variant="danger"
                            onClick={handleDeleteAccount}
                            className="w-full justify-center"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Account
                        </GlassButton>
                    </GlassCard>
                </div>
            </section>

            {/* Sign Out */}
            <div className="pt-8">
                <GlassButton
                    variant="ghost"
                    onClick={handleSignOut}
                    loading={isSigningOut}
                    className="w-full text-[var(--text-tertiary)] hover:text-white"
                >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                </GlassButton>
                <div className="text-center mt-4">
                    <p className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest">
                        PlannrAI • v1.0.0 • Secure
                    </p>
                </div>
            </div>
        </div>
    );
}
