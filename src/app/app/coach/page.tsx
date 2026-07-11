'use client';

import { Suspense } from 'react';
import { CoachDashboard } from '@/components/coach/CoachDashboard';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useCoach } from '@/hooks/use-coach';
import { DynamicBackground } from '@/components/ui/DynamicBackground';
import { dispatchAppEvent } from '@/lib/events';

function CoachPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const context = searchParams.get('context');
    const prompt = searchParams.get('prompt');
    const { messages, sendMessage } = useCoach();
    const initialized = useRef(false);

    useEffect(() => {
        if (!initialized.current && messages.length === 0) {
            let handled = false;
            if (prompt) {
                sendMessage(prompt);
                handled = true;
            } else if (context === 'calendar') {
                sendMessage("I'm looking at my calendar and need some help.");
                handled = true;
            } else if (context === 'do_more_today' || context === 'fix_today_schedule' || context === 'reduce_today_load') {
                // Trigger the quick action bubble click if available
                setTimeout(() => {
                    const texts: Record<string, string> = {
                        'do_more_today': 'Do more today',
                        'fix_today_schedule': "Fix today's schedule",
                        'reduce_today_load': "Reduce today's load"
                    };
                    const label = texts[context];
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const target = buttons.find(b => b.textContent?.toLowerCase().includes(label.toLowerCase()));
                    if (target) target.click();
                }, 100);
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
    }, [context, prompt, messages.length, sendMessage]);

    return (
        <div className="w-full h-full relative overflow-hidden flex flex-col">
            <div className="relative z-10 w-full h-full flex flex-col">
                <CoachDashboard
                    onCalendarUpdate={() => {
                        router.refresh();
                        dispatchAppEvent({ type: 'calendar-refresh' });
                    }}
                />
            </div>
        </div>
    );
}

export default function CoachPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full text-foreground/40">Loading coach...</div>}>
            <CoachPageInner />
        </Suspense>
    );
}
