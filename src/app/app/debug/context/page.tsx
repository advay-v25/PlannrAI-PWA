
'use client';

import { ContextDebugger } from '@/components/settings/context-debugger';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ContextDebugPage() {
    return (
        <div className="min-h-screen bg-[var(--bg-primary)] p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-4">
                    <Link href="/app/settings" className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Context Engine Debugger</h1>
                        <p className="text-[var(--text-secondary)]">Direct interface to the Liquid Context Brain</p>
                    </div>
                </div>

                <ContextDebugger />
            </div>
        </div>
    );
}
