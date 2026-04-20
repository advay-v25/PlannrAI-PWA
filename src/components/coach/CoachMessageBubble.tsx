'use client';

import { CoachMessage } from '@/hooks/use-coach';


interface CoachMessageBubbleProps {
    message: CoachMessage;
}

export function CoachMessageBubble({ message }: CoachMessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${isUser
                        ? 'bg-primary text-white ml-12 rounded-tr-none'
                        : 'glass border-l-2 border-l-primary/50 text-foreground mr-12 rounded-tl-none'
                    }`}
            >
                <div className="flex flex-col space-y-1">
                    {!isUser && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80 mb-1">
                            Donna · Strategic Lead
                        </span>
                    )}
                    <p className="text-sm leading-relaxed font-regular">
                        {message.content}
                    </p>
                </div>
            </div>
        </div>
    );
}
