'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock, Layout, Brain, Activity, Calendar as CalendarIcon,
    User, LogOut, Shield, Trash2, Save, AlertTriangle, Loader2,
    ChevronRight, ExternalLink, Moon, TrendingUp
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ProfilePreferences } from '@/lib/types/settings';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// Sections
import CoreConstraints from './_components/core-constraints';
import WorkPreferences from './_components/work-preferences';
import AIControls from './_components/ai-controls';
import BodyDiet from './_components/body-diet';
import Integrations from './_components/integrations';
import ProductivityProfile from './_components/productivity-profile';
import CommitmentsManager from './_components/commitments-manager';
import PersonalRulesManager from './_components/personal-rules-manager';

export default function SettingsPage() {
    const router = useRouter();
    const [preferences, setPreferences] = useState<ProfilePreferences | null>(null);
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('account');
    const [unsavedChanges, setUnsavedChanges] = useState<Partial<ProfilePreferences>>({});
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await apiClient.get<{ profile: any; preferences: ProfilePreferences }>('/api/profile/me');
            setProfile(res.profile);
            setPreferences(res.preferences);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = (patch: Partial<ProfilePreferences>) => {
        setUnsavedChanges(prev => ({ ...prev, ...patch }));
        setPreferences(prev => prev ? ({ ...prev, ...patch }) : null);
    };

    const saveChanges = async () => {
        if (!preferences) return;
        const isCritical = ['sleep_start', 'wake_time', 'meals_per_day', 'weekend_intensity'].some(k => k in unsavedChanges);

        if (isCritical) {
            setIsPreviewing(true);
            return;
        }

        try {
            await apiClient.post('/api/settings/update', unsavedChanges);
            setUnsavedChanges({});
            toast.success("Settings saved");
        } catch (err) {
            toast.error("Failed to save");
            loadSettings();
        }
    };

    const handlePreviewApply = async () => {
        try {
            const previewRes = await apiClient.post<any>('/api/settings/preview-regenerate', {
                reason: "User settings update",
                changes: unsavedChanges
            });
            await apiClient.post('/api/settings/apply', { patch: previewRes.patch });
            setUnsavedChanges({});
            setIsPreviewing(false);
            toast.success("Schedule regenerated with new settings");
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch (err) {
            toast.error("Failed to apply changes");
        }
    };

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch (err) {
            toast.error("Failed to sign out");
            setIsSigningOut(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white/50 gap-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Settings...</span>
            </div>
        );
    }

    const sections = [
        { id: 'account', label: 'Account', icon: User },
        { id: 'profile', label: 'Productivity Profile', icon: TrendingUp },
        { id: 'core', label: 'Core Constraints', icon: Clock },
        { id: 'commitments', label: 'Commitments', icon: Shield },
        { id: 'work', label: 'Work Pillars', icon: Layout },
        { id: 'body', label: 'Body & Diet', icon: Activity },
        { id: 'ai', label: 'AI Intelligence', icon: Brain },
        { id: 'rules', label: 'Personal Rules', icon: Shield },
        { id: 'integrations', label: 'Integrations', icon: CalendarIcon },
        { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
    ];

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-black">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl p-4 hidden md:flex flex-col">
                <h1 className="text-lg font-bold px-3 mb-6 text-white tracking-tight">Settings</h1>

                <nav className="space-y-1 flex-1">
                    {sections.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSection(s.id)}
                            className={cn(
                                "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                                activeSection === s.id
                                    ? "bg-white/10 text-white"
                                    : s.id === 'danger'
                                        ? "text-red-400/50 hover:text-red-400 hover:bg-red-500/5"
                                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                            )}
                        >
                            <s.icon className="w-4 h-4" />
                            {s.label}
                        </button>
                    ))}
                </nav>

                {/* Sign Out at bottom */}
                <div className="pt-4 border-t border-white/5 mt-4">
                    <button
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium
                            text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                    >
                        {isSigningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                        {isSigningOut ? 'Signing out...' : 'Sign Out'}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative">
                <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-8 pb-32">
                    {activeSection === 'account' && (
                        <AccountSection profile={profile} onSignOut={handleSignOut} isSigningOut={isSigningOut} />
                    )}
                    {activeSection === 'profile' && (
                        <ProductivityProfile />
                    )}
                    {activeSection === 'core' && preferences && (
                        <CoreConstraints preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'work' && preferences && (
                        <WorkPreferences preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'body' && preferences && (
                        <BodyDiet preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'ai' && preferences && (
                        <AIControls preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'commitments' && (
                        <CommitmentsManager />
                    )}
                    {activeSection === 'integrations' && preferences && (
                        <Integrations preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'rules' && (
                        <PersonalRulesManager />
                    )}
                    {activeSection === 'danger' && (
                        <DangerZone />
                    )}
                </div>

                {/* Floating Save Bar */}
                <AnimatePresence>
                    {Object.keys(unsavedChanges).length > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10
                                shadow-2xl backdrop-blur-2xl rounded-2xl p-4 flex items-center gap-4 z-50 w-[90%] max-w-md"
                        >
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-white">Unsaved changes</h4>
                                <p className="text-xs text-white/40">{Object.keys(unsavedChanges).length} setting(s) modified</p>
                            </div>
                            <button
                                onClick={() => { setUnsavedChanges({}); loadSettings(); }}
                                className="px-3 py-2 rounded-lg text-xs font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all"
                            >
                                Reset
                            </button>
                            <button
                                onClick={saveChanges}
                                className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--color-primary)] text-white hover:brightness-110 transition-all"
                            >
                                <Save className="w-3.5 h-3.5 inline mr-1.5" />
                                {isPreviewing ? 'Applying...' : 'Save'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Preview Modal */}
                {isPreviewing && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-black/90 border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Schedule Impact</h3>
                                    <p className="text-xs text-white/40">These changes affect your schedule structure</p>
                                </div>
                            </div>
                            <p className="text-sm text-white/60">
                                Changing core constraints will restructure your schedule. Existing blocks may be moved or rescheduled.
                            </p>
                            <div className="flex gap-3 justify-end pt-2">
                                <button
                                    onClick={() => setIsPreviewing(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePreviewApply}
                                    className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-black hover:brightness-110 transition-all"
                                >
                                    Regenerate Schedule
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mobile Sign Out (visible on small screens) */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 border-t border-white/5 bg-black/90 backdrop-blur-xl">
                    <button
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold
                            text-red-400 bg-red-500/10 border border-red-500/20
                            hover:bg-red-500/20 disabled:opacity-50 transition-all"
                    >
                        {isSigningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                        {isSigningOut ? 'Signing out...' : 'Sign Out'}
                    </button>
                </div>
            </main>
        </div>
    );
}

// --- Account Section ---
function AccountSection({ profile, onSignOut, isSigningOut }: {
    profile: any;
    onSignOut: () => void;
    isSigningOut: boolean;
}) {
    const displayName = profile?.full_name || profile?.display_name || profile?.email?.split('@')[0] || 'User';
    const email = profile?.email || 'No email';
    const joined = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'Unknown';

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Account</h2>
                <p className="text-sm text-white/40 mt-1">Your profile and account information</p>
            </div>

            {/* Profile Card */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10 text-xl font-bold text-white">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-white truncate">{displayName}</h3>
                        <p className="text-sm text-white/40 truncate">{email}</p>
                        <p className="text-[10px] text-white/20 mt-0.5">Member since {joined}</p>
                    </div>
                </div>
            </div>

            {/* App Info */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] divide-y divide-white/5">
                <InfoRow label="App Version" value="v2.0.0" />
                <InfoRow label="Plan" value="Beta" badge="FREE" />
                <InfoRow label="AI Engine" value="Donna — Chief of Staff" />
                <InfoRow
                    label="Data Storage"
                    value="Supabase (encrypted)"
                    icon={<Shield className="w-3 h-3 text-emerald-400" />}
                />
            </div>

            {/* Sign Out */}
            <button
                onClick={onSignOut}
                disabled={isSigningOut}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-bold
                    text-red-400 bg-red-500/5 border border-red-500/15
                    hover:bg-red-500/10 hover:border-red-500/25 disabled:opacity-50 transition-all"
            >
                {isSigningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </button>
        </div>
    );
}

function InfoRow({ label, value, badge, icon }: {
    label: string;
    value: string;
    badge?: string;
    icon?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between px-5 py-3.5">
            <span className="text-sm text-white/40">{label}</span>
            <div className="flex items-center gap-2">
                {icon}
                <span className="text-sm text-white/70 font-medium">{value}</span>
                {badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {badge}
                    </span>
                )}
            </div>
        </div>
    );
}

// --- Danger Zone ---
function DangerZone() {
    const [confirmReset, setConfirmReset] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const handleResetSchedule = async () => {
        setIsResetting(true);
        try {
            await apiClient.post('/api/settings/update', { reset_schedule: true });
            toast.success("Schedule cleared. Use Plan Week to rebuild.");
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch (err) {
            toast.error("Failed to reset");
        } finally {
            setIsResetting(false);
            setConfirmReset(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-red-400 tracking-tight">Danger Zone</h2>
                <p className="text-sm text-white/40 mt-1">Irreversible actions. Proceed with caution.</p>
            </div>

            {/* Reset Schedule */}
            <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] p-5 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                        <Trash2 className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Clear All Schedule Blocks</h3>
                        <p className="text-xs text-white/40 mt-0.5">
                            Delete all scheduled blocks. Goals, habits, and settings will be preserved.
                            You can use Plan Week to regenerate your schedule.
                        </p>
                    </div>
                </div>

                {!confirmReset ? (
                    <button
                        onClick={() => setConfirmReset(true)}
                        className="w-full py-2.5 rounded-xl text-sm font-bold text-red-400
                            border border-red-500/20 hover:bg-red-500/10 transition-all"
                    >
                        Clear Schedule
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConfirmReset(false)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white/50
                                bg-white/5 hover:bg-white/10 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleResetSchedule}
                            disabled={isResetting}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white
                                bg-red-500 hover:brightness-110 disabled:opacity-50 transition-all"
                        >
                            {isResetting ? 'Clearing...' : 'Yes, Clear Everything'}
                        </button>
                    </div>
                )}
            </div>

            {/* Reset Preferences */}
            <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] p-5 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Reset All Preferences</h3>
                        <p className="text-xs text-white/40 mt-0.5">
                            Restore all settings to their defaults. Your schedule, goals, and habits stay intact.
                        </p>
                    </div>
                </div>

                {!confirmDelete ? (
                    <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-full py-2.5 rounded-xl text-sm font-bold text-red-400
                            border border-red-500/20 hover:bg-red-500/10 transition-all"
                    >
                        Reset to Defaults
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConfirmDelete(false)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white/50
                                bg-white/5 hover:bg-white/10 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    await apiClient.post('/api/settings/update', { reset_to_defaults: true });
                                    toast.success("Preferences reset to defaults");
                                    window.location.reload();
                                } catch {
                                    toast.error("Failed to reset");
                                }
                            }}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white
                                bg-red-500 hover:brightness-110 transition-all"
                        >
                            Yes, Reset Defaults
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
