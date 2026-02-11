
'use client';

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Check, X, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export function StatusPanel() {
    const [health, setHealth] = useState<any>(null);
    const [smoke, setSmoke] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const checkStatus = async () => {
        setLoading(true);
        try {
            const h = await apiClient.get('/api/health', { skipAuth: true });
            setHealth(h);

            // Only check smoke if auth might be valid, but apiClient injects auth automatically.
            // If smoke fails 401, it handles it.
            const s = await apiClient.get('/api/debug/smoke').catch(err => ({ error: err }));
            setSmoke(s);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkStatus();
    }, []);

    const StatusRow = ({ label, ok, detail, error }: { label: string, ok?: boolean, detail?: string, error?: string }) => (
        <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${ok === true ? 'bg-emerald-500' : ok === false ? 'bg-red-500' : 'bg-gray-500'}`} />
                <span className="text-sm font-medium">{label}</span>
            </div>
            <div className="text-right">
                {error ? (
                    <span className="text-xs text-red-400 max-w-[200px] truncate block">{error}</span>
                ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">{detail || (ok ? 'OK' : '-')}</span>
                )}
            </div>
        </div>
    );

    return (
        <GlassCard className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">System Status</h3>
                <button onClick={checkStatus} disabled={loading} className="text-[var(--text-tertiary)] hover:text-white transition-colors">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="space-y-1">
                {/* Health Checks */}
                <StatusRow label="Supabase Connection" ok={health?.supabase_ok} />
                <StatusRow label="AI Provider (Groq)" ok={health?.ai_ok} detail={!health?.env?.groq_key_present ? 'Missing Key' : undefined} />

                {/* Env Checks */}
                <StatusRow label="Env: Supabase URL" ok={health?.env?.supabase_url_present} />
                <StatusRow label="Env: Anon Key" ok={health?.env?.supabase_anon_present} />

                {/* Smoke Data */}
                {smoke && !smoke.error ? (
                    <>
                        <StatusRow label="Auth User" ok={true} detail={smoke.user?.email || smoke.user?.id?.slice(0, 8)} />
                        <StatusRow label="Active Goals" ok={true} detail={String(smoke.counts?.goals_active ?? 0)} />
                        <StatusRow label="Schedule Blocks (Week)" ok={true} detail={String(smoke.counts?.schedule_blocks_week ?? 0)} />
                        <StatusRow label="Anchors (Week)" ok={true} detail={String(smoke.counts?.anchors_week ?? 0)} />
                    </>
                ) : (
                    <StatusRow label="Smoke Test" ok={false} error={smoke?.error?.message || 'Auth Required'} />
                )}

                {/* Warnings */}
                {smoke?.warnings?.length > 0 && (
                    <div className="p-2 bg-orange-500/10 rounded-lg text-xs text-orange-400 mt-2">
                        <div className="flex items-center gap-2 mb-1 font-bold">
                            <AlertTriangle className="w-3 h-3" /> Warnings
                        </div>
                        {smoke.warnings.map((w: string, i: number) => <div key={i}>{w}</div>)}
                    </div>
                )}

                {/* Request IDs */}
                <div className="pt-2 text-[10px] text-[var(--text-tertiary)] font-mono opacity-50 text-right">
                    {health?.request_id && <div>Health Req: {health.request_id.slice(0, 8)}...</div>}
                    {smoke?.request_id && <div>Smoke Req: {smoke.request_id.slice(0, 8)}...</div>}
                </div>
            </div>
        </GlassCard>
    );
}
