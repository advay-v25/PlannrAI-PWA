'use client';

import { ProactiveSuggestion } from '@/hooks/useCoach';

interface ProactiveBannerProps {
    suggestion: ProactiveSuggestion;
    onAct: () => void;
    onDismiss: () => void;
}

export function ProactiveBanner({
    suggestion,
    onAct,
    onDismiss
}: ProactiveBannerProps) {
    const priorityStyles = {
        high: 'bg-amber-50 border-amber-200',
        medium: 'bg-blue-50 border-blue-200',
        low: 'bg-gray-50 border-gray-200',
    };

    return (
        <div className={`rounded-lg border p-4 ${priorityStyles[suggestion.priority]}`}>
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h4 className="font-medium text-gray-900 mb-1">
                        💡 {suggestion.title}
                    </h4>
                    <p className="text-sm text-gray-600">
                        {suggestion.message}
                    </p>
                </div>
                <button
                    onClick={onDismiss}
                    className="text-gray-400 hover:text-gray-600 ml-4"
                    aria-label="Dismiss"
                >
                    ✕
                </button>
            </div>

            <div className="mt-3 flex space-x-2">
                <button
                    onClick={onAct}
                    className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                >
                    {suggestion.action_label}
                </button>
                <button
                    onClick={onDismiss}
                    className="px-4 py-1.5 text-gray-600 text-sm hover:text-gray-800"
                >
                    Not now
                </button>
            </div>
        </div>
    );
}
