'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { StaticGlassCard as GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { Mail, Sparkles, ArrowRight, Check, Lock } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();
    const supabase = createClient();

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        setIsLoading(true);
        setError('');

        try {
            // Check rate limits before proceeding
            const rateLimitRes = await fetch('/api/auth/rate-limit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: mode === 'login' ? 'login' : 'signup', email }),
            });
            
            if (!rateLimitRes.ok) {
                const errorData = await rateLimitRes.json();
                throw new Error(errorData.error || 'Too many requests. Please try again later.');
            }

            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                window.location.href = '/app';
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
                    }
                });
                if (error) throw error;
                
                // If "Confirm Email" is disabled in Supabase, this will log them in immediately.
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    window.location.href = '/onboarding';
                } else {
                    // If email verification is on, Supabase will return an empty session.
                    // Direct users to check inbox.
                    window.location.href = '/verify-email';
                }
            }
        } catch (err: any) {
            console.error('[Auth Error]:', err);
            
            // If they are trying to log in but haven't confirmed email
            const errorMsg = err.message || '';
            if (errorMsg.toLowerCase().includes('email not confirmed') || errorMsg.toLowerCase().includes('verify your email')) {
                 window.location.href = '/verify-email';
                 return;
            }

            setError(err.message || 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError('');

        try {
            // Check rate limits before proceeding
            const rateLimitRes = await fetch('/api/auth/rate-limit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'oauth' }),
            });
            
            if (!rateLimitRes.ok) {
                const errorData = await rateLimitRes.json();
                throw new Error(errorData.error || 'Too many requests. Please try again later.');
            }

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    }
                },
            });

            if (error) throw error;
            // Removed manual window.location.assign to fix the double-redirect bug
        } catch (err: any) {
            console.error('[Auth Error - Google OAuth]:', err);
            setError(err.message || 'Failed to sign in with Google');
            setIsLoading(false);
        }
    };

    return (
        <div suppressHydrationWarning className="min-h-screen min-h-dvh flex items-center justify-center p-4 bg-[var(--color-bg-primary)] dark:bg-gradient-to-b dark:from-[#1a0a00] dark:via-neutral-950 dark:to-neutral-950 overflow-hidden relative">
            <div className="w-full max-w-md relative z-10">
                <GlassCard variant="glow" padding="lg" className="shadow-2xl">
                    <div className="relative z-10">
                        {/* Logo & Title */}
                        <div className="text-center mb-8">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/20 mb-4 border border-orange-500/30"
                            >
                                <Sparkles className="w-8 h-8 text-orange-500" />
                            </motion.div>

                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)] mb-2">
                                Welcome to PlannrAI
                            </h1>
                            <p className="text-[var(--text-secondary)] text-sm">
                                Your AI-powered executive assistant
                            </p>
                        </div>

                        {/* Email/Password Form */}
                        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
                            <GlassInput
                                type="email"
                                placeholder="your@email.com"
                                label="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                            <div>
                                <GlassInput
                                    type="password"
                                    placeholder="••••••••"
                                    label="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                {mode === 'login' && (
                                    <div className="flex justify-end mt-2">
                                        <Link 
                                            href="/forgot-password" 
                                            className="text-xs text-[var(--text-muted)] hover:text-orange-500 transition-colors"
                                        >
                                            Forgot password?
                                        </Link>
                                    </div>
                                )}
                            </div>

                            <AnimatePresence mode="wait">
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="text-xs text-[var(--color-error)] bg-[var(--color-error)]/10 p-3 rounded-lg border border-[var(--color-error)]/20"
                                    >
                                        {error}
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            <GlassButton
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={isLoading}
                                className="w-full h-12 text-sm font-bold tracking-wide group"
                            >
                                {mode === 'login' ? 'Sign In' : 'Create Account'}
                                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                            </GlassButton>

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode(mode === 'login' ? 'signup' : 'login');
                                        setError('');
                                    }}
                                    className="text-xs text-[var(--text-muted)] hover:text-orange-500 transition-colors py-2"
                                >
                                    {mode === 'login' 
                                        ? "Don't have an account? Sign up" 
                                        : "Already have an account? Sign in"}
                                </button>
                            </div>
                        </form>

                        {/* Divider */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1 h-px bg-[var(--glass-border)]" />
                            <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">or continue with</span>
                            <div className="flex-1 h-px bg-[var(--glass-border)]" />
                        </div>

                        {/* Google Sign In */}
                        <GlassButton
                            onClick={handleGoogleSignIn}
                            variant="default"
                            size="lg"
                            loading={isLoading}
                            className="w-full h-12 bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all text-[var(--text-primary)]"
                        >
                            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                <path
                                    fill="#EA4335"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                                <path
                                    fill="#4285F4"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                            </svg>
                            Google
                        </GlassButton>

                        {/* Footer */}
                        <div className="flex items-center justify-center gap-2 mt-8 text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] font-bold">
                            <Lock className="w-3 h-3" />
                            End-to-end encrypted
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
