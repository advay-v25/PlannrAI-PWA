import { useEffect } from 'react';

export type AppEvent =
    | { type: 'calendar-refresh' }
    | { type: 'goals-refresh' }
    | { type: 'coach-refresh' }
    | { type: 'schedule-recompute'; payload: { trigger: string; targetDate?: string; autoApply?: boolean; should_reoptimize?: boolean; suggestion?: string | null; banner?: any; [key: string]: any } }
    | { type: 'trigger'; payload: string };

export const dispatchAppEvent = (event: AppEvent) => {
    if (typeof window === 'undefined') return;
    const customEvent = new CustomEvent(event.type, { detail: 'payload' in event ? event.payload : undefined });
    window.dispatchEvent(customEvent);
};

export const useAppEvent = <T extends AppEvent['type']>(
    type: T,
    callback: (payload: Extract<AppEvent, { type: T }> extends { payload: infer P } ? P : void) => void
) => {
    useEffect(() => {
        const handler = (e: any) => callback(e.detail);
        window.addEventListener(type, handler);
        return () => window.removeEventListener(type, handler);
    }, [type, callback]);
};
