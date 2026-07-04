'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Lock, CheckCircle2, ChevronRight } from 'lucide-react';

function SetPasswordContent() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();
    const nextPath = searchParams.get('next') ?? '/onboarding';

    useEffect(() => {
        // Verify that the user is actually authenticated
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setStatus({ type: 'error', message: 'No active session found. Please return to login.' });
            }
        };
        checkSession();
    }, [supabase.auth]);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            setStatus({ type: 'error', message: 'Passwords do not match.' });
            return;
        }

        if (password.length < 6) {
            setStatus({ type: 'error', message: 'Password must be at least 6 characters long.' });
            return;
        }

        setIsLoading(true);
        setStatus({ type: 'idle', message: '' });

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });
            
            if (error) throw error;
            
            setStatus({ type: 'success', message: 'Password set successfully!' });
            
            setTimeout(() => {
                window.location.href = nextPath;
            }, 1000);
        } catch (err: any) {
            console.error('[Update Password Error]:', err);
            setStatus({ type: 'error', message: err.message || 'Failed to update password' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        window.location.href = nextPath;
    };

    return (
        <div className="min-h-screen min-h-dvh flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/40 via-neutral-950 to-neutral-950 overflow-hidden relative">
            {/* Background Orbs */}
            <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[150px]" />
            <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-[150px]" />

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                className="w-full max-w-md relative z-10"
            >
                <GlassCard variant="glow" padding="lg" className="border-white/10 shadow-3xl relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-50" />
                    
                    <div className="relative z-10">
                        <div className="text-center mb-8">
                            <motion.div
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 20 }}
                                className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-orange-500/20 to-orange-600/5 border border-orange-500/30 mb-6 shadow-inner-glow"
                            >
                                <Lock className="w-8 h-8 text-orange-500 filter drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                            </motion.div>

                            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/60 mb-2">
                                Optional: Set Password
                            </h1>
                            <p className="text-white/50 text-xs font-medium px-4">
                                You signed in with Google. You can set a password now to also sign in using your email in the future.
                            </p>
                        </div>

                        <form onSubmit={handleUpdatePassword} className="space-y-4 mb-6">
                            <GlassInput
                                type="password"
                                placeholder="••••••••"
                                label="New Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            
                            <GlassInput
                                type="password"
                                placeholder="••••••••"
                                label="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />

                            <AnimatePresence mode="wait">
                                {status.type !== 'idle' && (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={`text-xs p-3 rounded-lg border ${
                                            status.type === 'error' 
                                                ? 'text-red-400 bg-red-400/10 border-red-400/20' 
                                                : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                                        }`}
                                    >
                                        {status.message}
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            <div className="pt-2 space-y-3">
                                <GlassButton
                                    type="submit"
                                    variant="primary"
                                    size="lg"
                                    loading={isLoading}
                                    className="w-full h-12 text-sm font-bold tracking-wide group"
                                    disabled={status.type === 'success'}
                                >
                                    {status.type === 'success' ? 'Password Updated!' : 'Set Password'}
                                    {status.type === 'success' && <CheckCircle2 className="w-4 h-4 ml-2" />}
                                </GlassButton>

                                <button
                                    type="button"
                                    onClick={handleSkip}
                                    className="w-full h-12 text-xs font-bold tracking-widest uppercase text-white/40 hover:text-white transition-colors flex items-center justify-center group"
                                >
                                    Skip for now
                                    <ChevronRight className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                </button>
                            </div>
                        </form>
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}

export default function SetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen min-h-dvh bg-neutral-950 flex items-center justify-center text-white/40 text-xs">Loading...</div>}>
            <SetPasswordContent />
        </Suspense>
    );
}
