'use client';

import { useEffect } from 'react';
import { useUserStore, useGoalsStore, useHabitStacksStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function RealtimeSync() {
    const { profile, setProfile } = useUserStore();
    const supabase = createClient();

    useEffect(() => {
        if (!profile?.id) return;

        // Subscribe to changes on profile
        const profileChannel = supabase
            .channel('public:profiles')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
                (payload) => {
                    setProfile(payload.new as any);
                }
            )
            .subscribe();

        // Subscribe to goals
        const goalsChannel = supabase
            .channel('public:goals')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${profile.id}` },
                () => {
                    // When goals change in DB (from other tab), refresh goals
                    // A proper implementation would use setGoals(payload.new) but often a refetch is safer to ensure joined data is intact
                    window.dispatchEvent(new CustomEvent('calendar-refresh'));
                    // Note: In a full app, you would dispatch an event that useGoalsManager listens to, to refetch goals
                }
            )
            .subscribe();

        // Subscribe to daily logs
        const dailyLogsChannel = supabase
            .channel('public:daily_logs')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'daily_logs', filter: `user_id=eq.${profile.id}` },
                (payload) => {
                    window.dispatchEvent(new CustomEvent('calendar-refresh'));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(profileChannel);
            supabase.removeChannel(goalsChannel);
            supabase.removeChannel(dailyLogsChannel);
        };
    }, [profile?.id, supabase, setProfile]);

    return null;
}
