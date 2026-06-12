'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { CoachChat } from '@/components/coach/CoachChat';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useCoach } from '@/hooks/use-coach';
import { DynamicBackground } from '@/components/ui/DynamicBackground';
import { InteractivePreview } from '@/components/coach/InteractivePreview';

function CoachPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const context = searchParams.get('context');
    const { messages, sendMessage, applyOption } = useCoach();
    const initialized = useRef(false);

    const [previewOption, setPreviewOption] = useState<import('@/types/coach-v4').CoachOption | null>(null);

    useEffect(() => {
        if (context === 'calendar' && messages.length === 0 && !initialized.current) {
            initialized.current = true;
            sendMessage("I'm looking at my calendar and need some help.");
        }
    }, [context, messages.length, sendMessage]);

    const handleApplyOption = async (option: import('@/types/coach-v4').CoachOption) => {
        const parentMessage = messages.find(m => m.options?.some(o => o.id === option.id));
        if (!parentMessage) return;
        
        // Apply the option
        await applyOption(parentMessage.id, option.id);
        
        // Hide preview
        setPreviewOption(null);
        
        // Trigger refresh
        router.refresh();
        window.dispatchEvent(new Event('calendar-refresh'));
    };

    return (
        <div className="h-full flex overflow-hidden">
            <DynamicBackground variant="coach" />
            
            {/* Left Pane - Chat Area */}
            <div className={`transition-all duration-500 ease-in-out h-full border-r border-white/5 bg-black/20 ${previewOption ? 'w-[400px] shrink-0' : 'w-full max-w-3xl mx-auto'}`}>
                <CoachChat
                    onCalendarUpdate={() => {
                        router.refresh();
                        window.dispatchEvent(new Event('calendar-refresh'));
                    }}
                    onPreviewOption={setPreviewOption}
                />
            </div>
            
            {/* Right Pane - Interactive Preview */}
            <div className={`transition-all duration-500 ease-in-out h-full overflow-hidden ${previewOption ? 'flex-1 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10'}`}>
                {previewOption && (
                    <InteractivePreview 
                        option={previewOption} 
                        onApply={handleApplyOption}
                        onCancel={() => setPreviewOption(null)}
                    />
                )}
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
