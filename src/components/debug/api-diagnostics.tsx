// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { GlassCard } from '@/components/ui/glass-card';
import { AlertCircle, CheckCircle2, Activity, ShieldCheck, Server } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function ApiDiagnostics() {
    const [health, setHealth] = useState<{ ok: boolean; env: string; time?: string } | null>(null);
    const [auth, setAuth] = useState<{ status: string; userId?: string } | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Toggle visibility with ?debug=1 in URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('debug') === '1') {
            setIsVisible(true);
        }

        const checkSystem = async () => {
            // Health
            const h = await apiClient.checkHealth();
            setHealth(h);

            // Auth
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            setAuth({
                status: session ? 'Authenticated' : 'Unauthenticated',
                userId: session?.user?.id
            });
        };

        if (params.get('debug') === '1') {
            checkSystem();
        }
    }, []);

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] w-80">
            <GlassCard padding="md" className="border-[var(--color-primary)]/30 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-[var(--color-primary)]" />
                    <h3 className="font-bold text-sm uppercase tracking-widest text-[var(--text-primary)]">API Diagnostics</h3>
                </div>

                <div className="space-y-3">
                    {/* Health Status */}
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                            <Server className="w-3.5 h-3.5" />
                            Backend Status
                        </div>
                        {health?.ok ? (
                            <span className="flex items-center gap-1 text-green-400 font-medium">
                                <CheckCircle2 className="w-3 h-3" /> Online
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-red-400 font-medium">
                                <AlertCircle className="w-3 h-3" /> Offline
                            </span>
                        )}
                    </div>

                    {/* Environment */}
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-tertiary)]">Environment</span>
                        <code className="px-1.5 py-0.5 rounded bg-white/5 text-[var(--color-primary)]">
                            {health?.env || 'Loading...'}
                        </code>
                    </div>

                    {/* Auth Status */}
                    <div className="flex items-center justify-between text-xs border-t border-white/5 pt-3">
                        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Auth State
                        </div>
                        <span className={auth?.status === 'Authenticated' ? 'text-blue-400' : 'text-orange-400'}>
                            {auth?.status || 'Checking...'}
                        </span>
                    </div>

                    {auth?.userId && (
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate block opacity-50">
                            UID: {auth.userId}
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex gap-2">
                    <button
                        onClick={() => window.location.reload()}
                        className="grow py-1.5 text-[10px] uppercase font-bold text-[var(--text-tertiary)] hover:text-white transition-colors"
                    >
                        Force Refresh
                    </button>
                    <button
                        onClick={() => setIsVisible(false)}
                        className="py-1.5 px-2 text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </GlassCard>
        </div>
    );
}
