'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Lock, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        // Verify that the user is actually authenticated (which they should be if they arrived via the reset link)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setStatus({ type: 'error', message: 'No active session found. Please request a new password reset link.' });
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
            
            setStatus({ type: 'success', message: 'Password updated successfully!' });
            
            // Redirect to app after a brief delay so they can see the success message
            setTimeout(() => {
                router.push('/app');
            }, 1500);
        } catch (err: any) {
            console.error('[Update Password Error]:', err);
            setStatus({ type: 'error', message: err.message || 'Failed to update password' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-black overflow-hidden relative">
            {/* Background Orbs */}
            <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-orange-500/10 rounded-full blur-[120px]" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-md relative z-10"
            >
                <GlassCard variant="glow" padding="lg" className="border-white/10 shadow-2xl">
                    <div className="relative z-10">
                        {/* Title */}
                        <div className="text-center mb-8">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/20 mb-4 border border-orange-500/30"
                            >
                                <Lock className="w-8 h-8 text-orange-500" />
                            </motion.div>

                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2">
                                Set New Password
                            </h1>
                            <p className="text-white/40 text-sm">
                                Enter your new password below.
                            </p>
                        </div>

                        {/* Password Form */}
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

                            <GlassButton
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={isLoading}
                                className="w-full h-12 text-sm font-bold tracking-wide group"
                                disabled={status.type === 'success'}
                            >
                                {status.type === 'success' ? 'Password Updated!' : 'Update Password'}
                                {status.type === 'success' && <CheckCircle2 className="w-4 h-4 ml-2" />}
                            </GlassButton>
                        </form>
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}
