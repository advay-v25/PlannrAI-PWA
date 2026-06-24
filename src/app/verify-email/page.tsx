'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Mail, ArrowRight, Inbox } from 'lucide-react';
import Link from 'next/link';

export default function VerifyEmailPage() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/40 via-neutral-950 to-neutral-950 overflow-hidden relative">
            {/* Background Orbs */}
            <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[150px]" />
            <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-[150px]" />

            <div
                className="w-full max-w-md relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both"
            >
                <GlassCard variant="glow" padding="lg" className="border-white/10 shadow-2xl text-center">
                    <div className="relative z-10">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-500/10 border border-orange-500/30 mb-6"
                        >
                            <Mail className="w-10 h-10 text-orange-500" />
                        </motion.div>

                        <h1 className="text-3xl font-bold text-white mb-4">
                            Verify Your Email
                        </h1>
                        
                        <p className="text-white/60 mb-8 leading-relaxed">
                            We have sent a secure verification link to your inbox. Please click the link to complete your registration and unlock PlannrAI.
                        </p>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8 text-left">
                            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                                <Inbox className="w-4 h-4 text-orange-400" />
                                Didn't receive the email?
                            </h3>
                            <ul className="text-xs text-white/50 list-disc list-inside space-y-1">
                                <li>Check your spam or junk folder.</li>
                                <li>Verify that your email address was entered correctly.</li>
                                <li>It can take up to 2 minutes for the email to arrive.</li>
                            </ul>
                        </div>

                        <div className="space-y-4">
                            <Link href="/login">
                                <GlassButton variant="primary" className="w-full font-bold">
                                    Back to Login
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </GlassButton>
                            </Link>
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
