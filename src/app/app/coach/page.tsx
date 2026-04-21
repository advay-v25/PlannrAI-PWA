'use client';

import { Suspense } from 'react';
import { CoachChat } from '@/components/coach/CoachChat';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useCoach } from '@/hooks/use-coach';

function CoachPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const context = searchParams.get('context');
    const { messages, sendMessage } = useCoach();
    const initialized = useRef(false);

    useEffect(() => {
        if (context === 'calendar' && messages.length === 0 && !initialized.current) {
            initialized.current = true;
            sendMessage("I'm looking at my calendar and need some help.");
        }
    }, [context, messages.length, sendMessage]);

    return (
        <div className="h-screen flex flex-col">
            <CoachChat
                onClose={() => router.push('/app')}
                onCalendarUpdate={() => router.refresh()}
            />
        </div>
    );
}

export default function CoachPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen text-foreground/40">Loading coach...</div>}>
            <CoachPageInner />
        </Suspense>
    );
}
