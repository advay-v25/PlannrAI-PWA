'use client';

import { Brain, Sparkles } from 'lucide-react';

export default function BrainDumpPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6 text-center px-4">
            <div className="relative">
                <div className="absolute -inset-4 bg-[var(--color-mind)]/20 blur-2xl rounded-full" />
                <div className="w-20 h-20 rounded-2xl bg-[var(--glass-bg)] border border-[var(--color-mind)]/30 flex items-center justify-center relative z-10 shadow-xl">
                    <Brain className="w-10 h-10 text-[var(--color-mind)]" />
                </div>
            </div>
            
            <div className="space-y-2 max-w-md">
                <h1 className="text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                    Brain Dump <Sparkles className="w-5 h-5 text-[var(--color-mind)]" />
                </h1>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    We're reimagining how you capture and process your thoughts. The new Brain Dump experience is currently under construction and will be available soon.
                </p>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-mind)]/10 border border-[var(--color-mind)]/20 text-[var(--color-mind)] text-xs font-medium uppercase tracking-widest mt-4">
                Coming Soon
            </div>
        </div>
    );
}
