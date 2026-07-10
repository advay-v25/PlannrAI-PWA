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
            if (prompt) {
                initialized.current = true;
                sendMessage(prompt);
            } else if (context === 'calendar') {
                initialized.current = true;
                sendMessage("I'm looking at my calendar and need some help.");
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
