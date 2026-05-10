'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Mail, ArrowLeft, Send } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
    const supabase = createClient();

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setIsLoading(true);
        setStatus({ type: 'idle', message: '' });

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback?next=/reset-password`,
            });
            if (error) throw error;

            setStatus({ type: 'success', message: 'Check your email for the password reset link.' });
            setEmail('');
        } catch (err: any) {
            console.error('[Reset Password Error]:', err);
            setStatus({ type: 'error', message: err.message || 'Failed to send reset email' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-black overflow-hidden relative">
            {/* Background Orbs */}
            <div className="absolute top-1/4 -left-20 w-96 h-96 bg-orange-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />

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
                                <Mail className="w-8 h-8 text-orange-500" />
                            </motion.div>

                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2">
                                Reset Password
                            </h1>
                            <p className="text-white/40 text-sm">
                                We'll send you a secure link to reset it.
                            </p>
                        </div>

                        {/* Email Form */}
                        <form onSubmit={handleResetPassword} className="space-y-4 mb-6">
                            <GlassInput
                                type="email"
                                placeholder="your@email.com"
                                label="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />

                            <AnimatePresence mode="wait">
                                {status.type !== 'idle' && (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={`text-xs p-3 rounded-lg border ${status.type === 'error'
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
                                Send Reset Link
                                {!isLoading && <Send className="w-4 h-4 ml-2" />}
                            </GlassButton>
                        </form>

                        <div className="text-center">
                            <Link
                                href="/login"
                                className="inline-flex items-center text-xs text-white/40 hover:text-white transition-colors"
                            >
                                <ArrowLeft className="w-3 h-3 mr-1" />
                                Back to login
                            </Link>
                        </div>
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}
