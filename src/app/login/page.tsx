'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Mail, Sparkles, ArrowRight, Check } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();
    const supabase = createClient();

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setIsLoading(true);
        setError('');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
                },
            });

            if (error) throw error;
            setIsSent(true);
        } catch (err: any) {
            console.error('[Auth Error - Magic Link]:', err);
            
            // Handle common Supabase SMTP limit error
            if (err.message?.includes('Error sending magic link') || err.message?.includes('email provider')) {
                setError('Email provider error. Ensure your SMTP settings (Sender Email, API Key) in Supabase match your Resend configuration.');
            } else if (err.status === 429) {
                setError('Rate limit reached. Please wait a few minutes or use Google Sign-In.');
            } else {
                setError(err.message || 'Failed to send magic link');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError('');

        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
                },
            });

            if (error) throw error;
            if (data?.url) {
                window.location.assign(data.url);
            }
        } catch (err: any) {
            console.error('[Auth Error - Google OAuth]:', err);
            setError(err.message || 'Failed to sign in with Google');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-md"
            >
                <GlassCard variant="glow" padding="lg" className="relative overflow-hidden">
                    {/* Decorative gradient orb */}
                    <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[var(--color-primary)] opacity-20 blur-3xl" />

                    <div className="relative z-10">
                        {/* Logo & Title */}
                        <div className="text-center mb-8">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)]/20 mb-4"
                            >
                                <Sparkles className="w-8 h-8 text-[var(--color-primary)]" />
                            </motion.div>

                            <h1 className="text-2xl font-bold text-gradient mb-2">
                                Welcome to PlannrAI
                            </h1>
                            <p className="text-[var(--color-text-secondary)] text-sm">
                                Build how you want to, adapt when you need to
                            </p>
                        </div>

                        <AnimatePresence mode="wait">
                            {!isSent ? (
                                <motion.div
                                    key="form"
                                    initial={{ opacity: 1 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    {/* Magic Link Form */}
                                    <form onSubmit={handleMagicLink} className="space-y-4 mb-6">
                                        <GlassInput
                                            type="email"
                                            placeholder="your@email.com"
                                            label="Email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            error={error}
                                        />

                                        <GlassButton
                                            type="submit"
                                            variant="primary"
                                            size="lg"
                                            loading={isLoading}
                                            className="w-full"
                                        >
                                            <Mail className="w-4 h-4" />
                                            Send Magic Link
                                        </GlassButton>
                                    </form>

                                    {/* Divider */}
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="flex-1 h-px bg-[var(--glass-border)]" />
                                        <span className="text-xs text-[var(--color-text-muted)]">or</span>
                                        <div className="flex-1 h-px bg-[var(--glass-border)]" />
                                    </div>

                                    {/* Google Sign In */}
                                    <GlassButton
                                        onClick={handleGoogleSignIn}
                                        variant="default"
                                        size="lg"
                                        loading={isLoading}
                                        className="w-full"
                                    >
                                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                                            <path
                                                fill="currentColor"
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            />
                                            <path
                                                fill="currentColor"
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            />
                                            <path
                                                fill="currentColor"
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                            />
                                            <path
                                                fill="currentColor"
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                            />
                                        </svg>
                                        Continue with Google
                                    </GlassButton>

                                    {/* No passwords promise */}
                                    <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
                                        No passwords. Ever. Just click a link.
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-center py-8"
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 200 }}
                                        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-success)]/20 mb-4"
                                    >
                                        <Check className="w-8 h-8 text-[var(--color-success)]" />
                                    </motion.div>

                                    <h2 className="text-xl font-semibold mb-2">Check your email</h2>
                                    <p className="text-[var(--color-text-secondary)] text-sm mb-4">
                                        We sent a magic link to<br />
                                        <span className="text-[var(--color-text-primary)]">{email}</span>
                                    </p>

                                    <GlassButton
                                        variant="ghost"
                                        onClick={() => setIsSent(false)}
                                        className="text-sm"
                                    >
                                        <ArrowRight className="w-4 h-4 rotate-180" />
                                        Use a different email
                                    </GlassButton>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}
