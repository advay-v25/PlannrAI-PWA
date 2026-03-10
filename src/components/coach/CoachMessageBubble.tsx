'use client';

import { CoachMessage } from '@/hooks/useCoach';

interface CoachMessageBubbleProps {
    message: CoachMessage;
}

export function CoachMessageBubble({ message }: CoachMessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[80%] px-4 py-2 rounded-lg ${isUser
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
            >
                <p className="text-sm">{message.content}</p>
            </div>
        </div>
    );
}
