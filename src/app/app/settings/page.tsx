'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, LogOut, Trash2, AlertTriangle, Loader2,
    Clock, Brain, Shield, Save, ChevronRight, Calendar
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import CoreConstraints from './_components/core-constraints';
import AIControls from './_components/ai-controls';
import CommitmentsManager from './_components/commitments-manager';
import { ProfilePreferences } from '@/lib/types/settings';

// ── Section types ──────────────────────────────────────────────────

const SECTIONS = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'schedule', label: 'Schedule', icon: Clock },
    { id: 'ai', label: 'AI Settings', icon: Brain },
    { id: 'commitments', label: 'Commitments', icon: Calendar },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// ── Main Page ──────────────────────────────────────────────────────

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();

    const [activeSection, setActiveSection] = useState<SectionId>('account');
    const [profile, setProfile] = useState<any>(null);
    const [preferences, setPreferences] = useState<ProfilePreferences | null>(null);
    const [unsavedChanges, setUnsavedChanges] = useState<Partial<ProfilePreferences>>({});
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get<{ profile: any; preferences: ProfilePreferences }>('/api/profile/me');
            setProfile(res.profile);
            setPreferences(res.preferences);
        } catch (err) {
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = (patch: Partial<ProfilePreferences>) => {
        setUnsavedChanges(prev => ({ ...prev, ...patch }));
        setPreferences(prev => prev ? { ...prev, ...patch } : null);
    };

    const saveChanges = async () => {
        if (!Object.keys(unsavedChanges).length) return;
        setIsSaving(true);
        try {
            await apiClient.post('/api/settings/update', unsavedChanges);
            setUnsavedChanges({});
            toast.success('Settings saved');
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch {
            toast.error('Failed to save settings');
            loadSettings();
        } finally {
            setIsSaving(false);
        }
    };

    // ── Sign Out: use Supabase browser client directly ──
    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            // Sign out on the client (clears local session state + cookies via Supabase SSR)
            await supabase.auth.signOut();
            // Also call server route to clear SSR cookies
            await fetch('/api/auth/logout', { method: 'POST' });
            // Force full page navigation (not client-side) so Next.js middleware re-checks auth
            window.location.href = '/login';
        } catch (err) {
            toast.error('Failed to sign out');
            setIsSigningOut(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center gap-3 text-[var(--text-tertiary)]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading settings...</span>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden">
            {/* Sidebar */}
            <aside className="w-56 border-r border-[var(--glass-border)] bg-[var(--glass-bg)]/30 p-4 hidden md:flex flex-col gap-1">
                <h1 className="text-base font-semibold px-3 mb-4 text-[var(--text-primary)]">Settings</h1>

                {SECTIONS.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id)}
                        className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                            activeSection === s.id
                                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                : s.id === 'danger'
                                    ? 'text-[var(--color-error)]/50 hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/5'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)]'
                        }`}
                    >
                        <s.icon className="w-4 h-4 flex-shrink-0" />
                        {s.label}
                    </button>
                ))}

                <div className="mt-auto pt-4 border-t border-[var(--glass-border)]">
                    <button
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium
                            text-[var(--color-error)]/60 hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/5
                            disabled:opacity-40 transition-all"
                    >
                        {isSigningOut
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <LogOut className="w-4 h-4" />}
                        {isSigningOut ? 'Signing out...' : 'Sign Out'}
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 space-y-6 pb-32">
                    {activeSection === 'account' && (
                        <AccountSection
                            profile={profile}
                            onSignOut={handleSignOut}
                            isSigningOut={isSigningOut}
                        />
                    )}
                    {activeSection === 'schedule' && preferences && (
                        <CoreConstraints preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'ai' && preferences && (
                        <AIControls preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'commitments' && (
                        <CommitmentsManager />
                    )}
                    {activeSection === 'danger' && (
                        <DangerZone />
                    )}
                </div>

                {/* Floating Save Bar */}
                <AnimatePresence>
                    {Object.keys(unsavedChanges).length > 0 && (
                        <motion.div
                            initial={{ y: 80, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 80, opacity: 0 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                                bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                shadow-2xl backdrop-blur-xl rounded-2xl p-3.5
                                flex items-center gap-3 w-[90%] max-w-sm"
                        >
                            <div className="flex-1">
                                <p className="text-xs font-semibold text-[var(--text-primary)]">Unsaved changes</p>
                                <p className="text-[10px] text-[var(--text-tertiary)]">{Object.keys(unsavedChanges).length} field(s) modified</p>
                            </div>
                            <button
                                onClick={() => { setUnsavedChanges({}); loadSettings(); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)]
                                    hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-all"
                            >
                                Reset
                            </button>
                            <button
                                onClick={saveChanges}
                                disabled={isSaving}
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold
                                    bg-[var(--color-primary)] text-white
                                    hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-1.5"
                            >
                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Save
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Mobile sign-out */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 border-t border-[var(--glass-border)] bg-[var(--glass-bg)]/90 backdrop-blur-xl">
                    <button
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold
                            text-[var(--color-error)] bg-[var(--color-error)]/5 border border-[var(--color-error)]/15
                            hover:bg-[var(--color-error)]/10 disabled:opacity-50 transition-all"
                    >
                        {isSigningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                        {isSigningOut ? 'Signing out...' : 'Sign Out'}
                    </button>
                </div>
            </main>
        </div>
    );
}

// ── Account Section ────────────────────────────────────────────────

function AccountSection({
    profile,
    onSignOut,
    isSigningOut,
}: {
    profile: any;
    onSignOut: () => void;
    isSigningOut: boolean;
}) {
    const displayName = profile?.full_name || profile?.display_name || profile?.first_name
        || profile?.email?.split('@')[0] || 'User';
    const email = profile?.email || '—';
    const joined = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : '—';

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Account</h2>
                <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Your profile and session</p>
            </div>

            {/* Profile card */}
            <div className="p-5 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--color-mind)]/20 to-[var(--color-primary)]/20
                        flex items-center justify-center border border-[var(--glass-border)] text-lg font-bold text-[var(--text-primary)]">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-[var(--text-primary)] truncate">{displayName}</p>
                        <p className="text-sm text-[var(--text-secondary)] truncate">{email}</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Member since {joined}</p>
                    </div>
                </div>
            </div>

            {/* App info */}
            <div className="rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] divide-y divide-[var(--glass-border)]">
                <InfoRow label="Version" value="v2.0.0" />
                <InfoRow label="Plan" value="Beta (Free)" />
                <InfoRow label="AI Engine" value="Donna — Chief of Staff" />
                <InfoRow label="Data" value="Supabase (encrypted)" icon={<Shield className="w-3 h-3 text-[var(--color-success)]" />} />
            </div>

            {/* Sign out */}
            <button
                onClick={onSignOut}
                disabled={isSigningOut}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold
                    text-[var(--color-error)] bg-[var(--color-error)]/5 border border-[var(--color-error)]/15
                    hover:bg-[var(--color-error)]/10 disabled:opacity-50 transition-all"
            >
                {isSigningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </button>
        </div>
    );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between px-5 py-3.5">
            <span className="text-sm text-[var(--text-tertiary)]">{label}</span>
            <div className="flex items-center gap-1.5">
                {icon}
                <span className="text-sm text-[var(--text-secondary)] font-medium">{value}</span>
            </div>
        </div>
    );
}

// ── Danger Zone ────────────────────────────────────────────────────

function DangerZone() {
    const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const handleClearSchedule = async () => {
        setIsLoading(true);
        try {
            await apiClient.post('/api/settings/update', { reset_schedule: true });
            toast.success('Schedule cleared. Regenerate it from the Calendar.');
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch {
            toast.error('Failed to clear schedule');
        } finally {
            setIsLoading(false);
            setConfirm(null);
        }
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText.toLowerCase() !== 'delete') {
            toast.error('Please type "delete" to confirm');
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/delete-account', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete account');

            toast.success('Account deleted. Goodbye!');
            // Sign out client and redirect
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.href = '/login';
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete account');
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-[var(--color-error)]">Danger Zone</h2>
                <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Irreversible actions — proceed carefully.</p>
            </div>

            {/* Clear Schedule */}
            <div className="p-5 rounded-2xl bg-[var(--color-error)]/[0.03] border border-[var(--color-error)]/15 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-error)]/10 flex items-center justify-center flex-shrink-0">
                        <Trash2 className="w-4 h-4 text-[var(--color-error)]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Clear Schedule</h3>
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            Deletes all scheduled blocks. Goals and settings are preserved. You can regenerate from Calendar.
                        </p>
                    </div>
                </div>

                {confirm !== 'reset' ? (
                    <button
                        onClick={() => setConfirm('reset')}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--color-error)]
                            border border-[var(--color-error)]/20 hover:bg-[var(--color-error)]/5 transition-all"
                    >
                        Clear All Schedule Blocks
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConfirm(null)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-secondary)]
                                bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleClearSchedule}
                            disabled={isLoading}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                                bg-[var(--color-error)] hover:brightness-110 disabled:opacity-50 transition-all"
                        >
                            {isLoading ? 'Clearing...' : 'Yes, Clear'}
                        </button>
                    </div>
                )}
            </div>

            {/* Delete Account */}
            <div className="p-5 rounded-2xl bg-[var(--color-error)]/[0.03] border border-[var(--color-error)]/15 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-error)]/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-4 h-4 text-[var(--color-error)]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Delete Account</h3>
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            Permanently deletes your account, all schedule blocks, goals, conversations, AI memory, and all associated data. This cannot be undone.
                        </p>
                    </div>
                </div>

                {confirm !== 'delete' ? (
                    <button
                        onClick={() => setConfirm('delete')}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--color-error)]
                            border border-[var(--color-error)]/20 hover:bg-[var(--color-error)]/5 transition-all"
                    >
                        Delete My Account
                    </button>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-[var(--text-secondary)]">
                            Type <strong className="text-[var(--color-error)]">delete</strong> to confirm permanent deletion:
                        </p>
                        <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="Type 'delete' to confirm"
                            className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--glass-bg)] border border-[var(--color-error)]/30
                                text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none
                                focus:border-[var(--color-error)]/50 transition-all"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setConfirm(null); setDeleteConfirmText(''); }}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-secondary)]
                                    bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={isLoading || deleteConfirmText.toLowerCase() !== 'delete'}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                                    bg-[var(--color-error)] hover:brightness-110 disabled:opacity-50 transition-all"
                            >
                                {isLoading ? 'Deleting...' : 'Delete Everything'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
