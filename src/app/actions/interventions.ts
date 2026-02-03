'use server';

import { createClient } from '@/lib/supabase/server';
import { InterventionManager } from '@/lib/ai/interventions';
import { InterventionLog } from '@/types/database';

export async function checkInterventionsAction(userId: string): Promise<InterventionLog | null> {
    const supabase = await createClient();

    // We pass the server-side client to the manager
    return InterventionManager.checkInterventions(userId, supabase);
}
