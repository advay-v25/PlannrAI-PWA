'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserStore } from '@/stores';
import { useToast } from '@/components/ui/toast';
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
import { apiClient } from '@/lib/api-client';
import { StatusPanel } from '@/components/settings/status-panel';

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
        showToast('✅ Settings saved', 'success');
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
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-sm text-[var(--color-text-muted)]">
                    Customize your experience
                </p>
            </div>

            {/* Profile */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <User className="w-4 h-4 text-[var(--color-primary)]" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Neural Profile</h2>
                </div>
                <GlassCard padding="lg" variant="glow" className="space-y-6 border-[var(--color-primary)]/20 shadow-[0_0_40px_var(--color-primary-glow)]">
                    <div className="flex items-center gap-4 pb-6 border-b border-white/5">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-primary)]/20 to-transparent flex items-center justify-center border border-[var(--color-primary)]/30">
                            <User className="w-8 h-8 text-[var(--color-primary)]" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-xl font-bold tracking-tight">{profile?.preferred_name || profile?.full_name || userEmail}</p>
                            <p className="text-sm font-medium text-[var(--text-tertiary)] tracking-wide">
                                {userEmail}
                            </p>
                        </div>
                    </div>

                    {/* Editable Name Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] px-1">
                                Call Sign (Preferred Name)
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
                                placeholder="e.g., Advay"
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:border-[var(--color-primary)]/50 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all outline-none font-medium"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] px-1">
                                Designation (Full Name)
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
                                placeholder="Your full name"
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:border-[var(--color-primary)]/50 focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all outline-none font-medium"
                            />
                        </div>
                    </div>
                </GlassCard>
            </section>

            {/* Time & Constraints */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Temporal Anchors</h2>
                </div>

                <GlassCard padding="lg" className="border-white/5 shadow-xl">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] px-1">
                                <Moon className="w-3.5 h-3.5" />
                                System Wind-down
                            </label>
                            <input
                                type="time"
                                value={profile?.sleep_start || '22:00'}
                                onChange={(e) => handleUpdate({ sleep_start: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-[var(--color-primary)]/50 transition-all outline-none font-mono"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] px-1">
                                <Sun className="w-3.5 h-3.5" />
                                Neural Restoration
                            </label>
                            <input
                                type="time"
                                value={profile?.sleep_end || '07:00'}
                                onChange={(e) => handleUpdate({ sleep_end: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-[var(--color-primary)]/50 transition-all outline-none font-mono"
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
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Shield className="w-4 h-4 text-[var(--color-primary)]" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Neural Agency</h2>
                </div>

                <GlassCard padding="lg" className="space-y-2 border-white/5 shadow-xl">
                    <div className="px-1 py-1">
                        <GlassToggle
                            checked={profile?.ai_can_suggest || false}
                            onChange={(checked) => handleUpdate({ ai_can_suggest: checked })}
                            label="Strategic Insights"
                            description="AI can identify high-leverage opportunities"
                        />
                    </div>
                    <div className="border-t border-white/5 mx-2" />
                    <div className="px-1 py-1">
                        <GlassToggle
                            checked={profile?.ai_can_analyze || false}
                            onChange={(checked) => handleUpdate({ ai_can_analyze: checked })}
                            label="Pattern Synthesis"
                            description="Enable cross-module intelligence learning"
                        />
                    </div>
                    <div className="border-t border-white/5 mx-2" />
                    <div className="px-1 py-1">
                        <GlassToggle
                            checked={profile?.ai_can_draft || false}
                            onChange={(checked) => handleUpdate({ ai_can_draft: checked })}
                            label="Drafting Protocols"
                            description="AI can prepare schedule mutations for review"
                        />
                    </div>
                </GlassCard>
            </section>

            {/* System Status - Hidden for users */}
            {/* <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Activity className="w-4 h-4 text-[var(--color-primary)]" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">System Reliability</h2>
                </div>
                <StatusPanel />
            </section> */}

            {/* AI Usage Stats */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Intelligence Heartbeat</h2>
                </div>

                <GlassCard padding="lg" className="border-white/5 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <Activity className="w-24 h-24" />
                    </div>
                    <div className="grid grid-cols-2 gap-8 relative z-10">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Daily Cycles</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold tracking-tighter">{aiUsage?.daily || 0}</span>
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">/ {aiUsage?.limit.toLocaleString() || '14,400'}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Current Period</p>
                            <p className="text-2xl font-bold tracking-tighter">{aiUsage?.monthly || 0}</p>
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
                loading={isSigningOut}
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
