// @ts-nocheck

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, LogOut, Shield, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface ProfileData {
    id: string;
    email: string;
    full_name: string;
    timezone: string;
}

export default function ProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const res = await apiClient.get<any>('/api/profile/me');
            if (res.profile) {
                // Merge auth email if available, otherwise just use what we have
                setProfile({
                    ...res.profile,
                    email: res.auth_email || 'user@example.com' // Mock if auth email not passed in API
                });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        await apiClient.post('/api/auth/logout');
        router.push('/login');
    };

    if (loading) {
        return <div className="p-8 text-[var(--text-tertiary)]">Loading profile...</div>;
    }

    if (!profile) return null;

    return (
        <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-8">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">Identity</h1>
                <p className="text-sm text-[var(--text-secondary)]">Manage your account and personal details.</p>
            </header>

            {/* Avatar & Name */}
            <section className="flex items-center gap-6 p-6 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                    {profile.full_name?.[0] || 'U'}
                </div>
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">{profile.full_name || 'User'}</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">{profile.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
                            Pro Plan
                        </span>
                    </div>
                </div>
            </section>

            {/* Account Details */}
            <section className="space-y-1">
                <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest ml-1">Account</h3>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] overflow-hidden divide-y divide-[var(--glass-border)]">
                    <div className="p-4 flex items-center justify-between">
                        <span className="text-sm text-[var(--text-secondary)]">Full Name</span>
                        <span className="text-sm text-[var(--text-primary)] font-medium">{profile.full_name}</span>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                        <span className="text-sm text-[var(--text-secondary)]">Timezone</span>
                        <span className="text-sm text-[var(--text-primary)] font-mono bg-[var(--glass-bg-hover)] px-2 py-1 rounded">
                            {profile.timezone || 'UTC'}
                        </span>
                    </div>
                </div>
            </section>

            {/* Actions */}
            <section className="space-y-3 pt-4">
                <button
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-colors group"
                >
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-[var(--text-secondary)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">Data & Privacy</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]" />
                </button>

                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all font-medium"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </section>
        </div>
    );
}
