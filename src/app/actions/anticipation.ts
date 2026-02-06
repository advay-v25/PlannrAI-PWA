'use server';

import { createClient } from '@/lib/supabase/server';
import { AnticipationService, AnticipationSignal } from '@/lib/intelligence/anticipation-service';

export async function checkAnticipation(userId: string): Promise<AnticipationSignal | null> {
    try {
        const signal = await AnticipationService.analyzeTomorrow(userId);
        if (signal.type === 'clear') return null;
        return signal;
    } catch (error) {
        console.error("Anticipation check failed:", error);
        return null; // Silent failure
    }
}
