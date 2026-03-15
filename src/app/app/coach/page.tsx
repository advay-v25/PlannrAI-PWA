'use client';

import { Suspense } from 'react';
import { CoachChat } from '@/components/coach/coach-chat';
import { ProactiveBanner } from '@/components/coach/ProactiveBanner';
import { useCoach } from '@/hooks/use-coach';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';

function CoachPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const context = searchParams.get('context');
    const { messages, sendMessage, proactiveSuggestion, actOnProactive, dismissProactive } = useCoach();
    const initialized = useRef(false);

    useEffect(() => {
        if (context === 'calendar' && messages.length === 0 && !initialized.current) {
            initialized.current = true;
            sendMessage("I'm looking at my calendar and need some help.");
        }
    }, [context, messages.length, sendMessage]);

    const handleCalendarUpdate = () => {
        router.refresh();
    };

    return (
        <div className="h-screen flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
                <h1 className="text-xl font-semibold">AI Coach</h1>
                <button
                    onClick={() => router.push('/app/calendar')}
                    className="text-sm text-blue-600 hover:text-blue-800"
                >
                    View Calendar
                </button>
            </header>

            {/* Proactive Suggestion */}
            {proactiveSuggestion && (
                <div className="p-4 border-b bg-gray-50">
                    <ProactiveBanner
                        suggestion={proactiveSuggestion}
                        onAct={actOnProactive}
                        onDismiss={dismissProactive}
                    />
                </div>
            )}

            {/* Chat Area */}
            <div className="flex-1 overflow-hidden">
                <CoachChat onClose={() => router.push('/app')} />
            </div>
        </div>
    );
}

export default function CoachPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen text-[var(--text-tertiary)]">Loading coach...</div>}>
            <CoachPageInner />
        </Suspense>
    );
}
