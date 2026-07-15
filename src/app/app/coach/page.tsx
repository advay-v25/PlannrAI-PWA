'use client';

import { Suspense } from 'react';
import { CoachDashboard } from '@/components/coach/CoachDashboard';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useCoach } from '@/hooks/use-coach';
import { PageBackground } from '@/components/ui/PageBackground';
import { dispatchAppEvent } from '@/lib/events';

function CoachPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const context = searchParams.get('context');
    const prompt = searchParams.get('prompt');
    const { messages, sendMessage } = useCoach();
    const initialized = useRef(false);

    const quickActionContexts = ['do_more_today', 'fix_today_schedule', 'reduce_today_load'] as const;
    const initialQuickAction = quickActionContexts.find(c => c === context);

    useEffect(() => {
        if (!initialized.current && messages.length === 0) {
            let handled = false;
            if (prompt) {
                sendMessage(prompt);
                handled = true;
            } else if (context === 'calendar') {
                sendMessage("I'm looking at my calendar and need some help.");
                handled = true;
            } else if (initialQuickAction) {
                // Handled declaratively via CoachDashboard's initialQuickAction prop below.
                handled = true;
            }

            if (handled) {
                initialized.current = true;
                const url = new URL(window.location.href);
                url.searchParams.delete('context');
                url.searchParams.delete('prompt');
                window.history.replaceState({}, '', url.toString());
            }
        }
    }, [context, prompt, messages.length, sendMessage, initialQuickAction]);

    return (
        <div className="w-full h-full relative overflow-hidden flex flex-col">
            <PageBackground color="orange" variant="rising" intensity="medium" />
            <div className="relative z-10 w-full h-full flex flex-col">
                <CoachDashboard
                    onCalendarUpdate={() => {
                        router.refresh();
                        dispatchAppEvent({ type: 'calendar-refresh' });
                    }}
                    initialQuickAction={initialQuickAction}
                />
            </div>
        </div>
    );
}

export default function CoachPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full text-[var(--text-primary)]/40">Loading coach...</div>}>
            <CoachPageInner />
        </Suspense>
    );
}
