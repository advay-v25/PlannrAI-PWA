'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Trash2, AlertTriangle, Archive, Pause, CheckCircle2, X } from 'lucide-react';
import { useGoalsStore } from '@/stores';

type ClearMode = 'archive' | 'pause' | 'delete';

export function ClearGoalsDialog({ onClose }: { onClose: () => void }) {
    const supabase = createClient();
    const { goals, setGoals } = useGoalsStore();
    const [mode, setMode] = useState<ClearMode>('archive');
    const [confirmText, setConfirmText] = useState('');
    const [loading, setLoading] = useState(false);

    const handleClear = async () => {
        if (mode === 'delete' && confirmText !== 'DELETE') return;
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            if (mode === 'archive') {
                await supabase.from('goals').update({ status: 'archived' }).eq('user_id', user.id).eq('status', 'active');
                setGoals(goals.map(g => g.status === 'active' ? { ...g, status: 'archived' } : g));
            } else if (mode === 'pause') {
                await supabase.from('goals').update({ status: 'paused' }).eq('user_id', user.id).eq('status', 'active');
                setGoals(goals.map(g => g.status === 'active' ? { ...g, status: 'paused' } : g));
            } else if (mode === 'delete') {
                await supabase.from('goals').delete().eq('user_id', user.id);
                setGoals([]);
            }

            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md glass-card p-6 border-red-500/20"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-6 text-[var(--color-warning)]">
                    <div className="p-2 bg-[var(--color-warning)]/10 rounded-xl">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">Clear All Goals</h2>
                        <p className="text-xs text-[var(--text-tertiary)]">Reset your current goal set</p>
                    </div>
                </div>

                <div className="space-y-4 mb-8">
                    {/* Option 1: Archive */}
                    <button
                        onClick={() => setMode('archive')}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4 ${mode === 'archive'
                            ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]'
                            : 'bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-60 hover:opacity-100'
                            }`}
                    >
                        <Archive className={`w-5 h-5 mt-0.5 ${mode === 'archive' ? 'text-[var(--color-primary)]' : 'text-[var(--text-tertiary)]'}`} />
                        <div>
                            <p className="font-bold text-sm">Archive All (Recommended)</p>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">Keeps history.</p>
                        </div>
                        {mode === 'archive' && <CheckCircle2 className="w-5 h-5 ml-auto text-[var(--color-primary)]" />}
                    </button>

                    {/* Option 2: Pause */}
                    <button
                        onClick={() => setMode('pause')}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4 ${mode === 'pause'
                            ? 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]'
                            : 'bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-60 hover:opacity-100'
                            }`}
                    >
                        <Pause className={`w-5 h-5 mt-0.5 ${mode === 'pause' ? 'text-[var(--color-warning)]' : 'text-[var(--text-tertiary)]'}`} />
                        <div>
                            <p className="font-bold text-sm">Pause All</p>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">Stops scheduling.</p>
                        </div>
                        {mode === 'pause' && <CheckCircle2 className="w-5 h-5 ml-auto text-[var(--color-warning)]" />}
                    </button>

                    {/* Option 3: Delete */}
                    <button
                        onClick={() => setMode('delete')}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4 ${mode === 'delete'
                            ? 'bg-[var(--color-error)]/10 border-[var(--color-error)]'
                            : 'bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-60 hover:opacity-100'
                            }`}
                    >
                        <Trash2 className={`w-5 h-5 mt-0.5 ${mode === 'delete' ? 'text-[var(--color-error)]' : 'text-[var(--text-tertiary)]'}`} />
                        <div>
                            <p className="font-bold text-sm text-[var(--color-error)]">Delete Everything</p>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">Permanent.</p>
                        </div>
                        {mode === 'delete' && <CheckCircle2 className="w-5 h-5 ml-auto text-[var(--color-error)]" />}
                    </button>
                </div>

                {mode === 'delete' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-6 space-y-2"
                    >
                        <label className="text-xs text-[var(--color-error)] font-bold uppercase">Type "DELETE" to confirm</label>
                        <GlassInput
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder="DELETE"
                            className="border-red-500/50 focus:border-red-500 text-red-500"
                        />
                    </motion.div>
                )}

                <div className="flex gap-3">
                    <GlassButton variant="ghost" className="flex-1" onClick={onClose}>Cancel</GlassButton>
                    <GlassButton
                        variant={mode === 'delete' ? 'danger' : 'primary'}
                        className="flex-1"
                        onClick={handleClear}
                        disabled={loading || (mode === 'delete' && confirmText !== 'DELETE')}
                        loading={loading}
                    >
                        {mode === 'delete' ? 'Delete' : 'Confirm'}
                    </GlassButton>
                </div>
            </motion.div>
        </div>
    );
}
