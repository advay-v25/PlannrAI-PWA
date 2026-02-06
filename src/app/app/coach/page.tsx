'use client';

import { ChatInterface } from '@/components/agent/chat-interface';

export default function CoachPage() {
    return (
        <div className="flex h-[calc(100vh-64px)] w-full flex-col bg-black/20">
            <div className="flex-1 overflow-hidden p-4 md:p-6">
                <div className="mx-auto h-full max-w-2xl overflow-hidden rounded-2xl border border-white/5 bg-black/40 shadow-2xl backdrop-blur-xl">
                    <ChatInterface />
                </div>
            </div>
        </div>
    );
}
