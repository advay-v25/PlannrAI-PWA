'use client';

import { CoachChat } from '@/components/coach/CoachChat';
import { ProactiveBanner } from '@/components/coach/ProactiveBanner';
import { useCoach } from '@/hooks/useCoach';
import { useRouter } from 'next/navigation';

export default function CoachPage() {
    const router = useRouter();
    const { proactiveSuggestion, actOnProactive, dismissProactive } = useCoach();

    const handleCalendarUpdate = () => {
        // Refresh calendar data
        // This could trigger a revalidation or redirect
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
                <CoachChat onCalendarUpdate={handleCalendarUpdate} />
            </div>
        </div>
    );
}
