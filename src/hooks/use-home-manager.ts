import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserStore, useGoalsStore, useDailyLogStore } from '@/stores';
import { useToast } from '@/components/ui/toast';
import { getOptimizationContextAction } from '@/app/actions/intelligence';
import type { ScheduleBlock, Goal } from '@/types/database';
import type { OptimizationContext } from '@/lib/intelligence/context-engine';
import type { AnticipationSignal } from '@/lib/intelligence/anticipation-service';

export type ScheduleBlockWithGoal = ScheduleBlock & { goal?: Goal };

export function useHomeManager() {
    const supabase = useMemo(() => createClient(), []);
    const { profile, setProfile, updateProfile } = useUserStore();
    const { goals, setGoals } = useGoalsStore();
    const { todayLog, setTodayLog } = useDailyLogStore();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [todayBlocks, setTodayBlocks] = useState<ScheduleBlockWithGoal[]>([]);
    const [anticipationSignal, setAnticipationSignal] = useState<AnticipationSignal | null>(null);
    const [intelContext, setIntelContext] = useState<OptimizationContext | null>(null);
    const [isSyncingIntel, setIsSyncingIntel] = useState(false);

    // Fetch Data
    const loadData = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (profileData) setProfile(profileData);

            // 2. Goals
            const { data: goalsData } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_paused', false);
            if (goalsData) setGoals(goalsData);

            // 3. Today's Blocks
            const today = new Date().toISOString().split('T')[0];
            const { data: blocksData } = await supabase
                .from('schedule_blocks')
                .select('*, goal:goals(*)')
                .eq('user_id', user.id)
                .eq('date', today)
                .order('start_time', { ascending: true });
            if (blocksData) setTodayBlocks(blocksData);

            // 4. Daily Log
            const { data: logData } = await supabase
                .from('daily_logs')
                .select('*')
                .eq('user_id', user.id)
                .eq('log_date', today)
                .maybeSingle();
            if (logData) {
                setTodayLog({
                    energy_level: logData.energy_level,
                    mood: logData.mood || '',
                    wins: logData.wins || [],
                    challenges: logData.challenges || [],
                });
            }

            // 5. Interventions (Removed)

            // 6. Anticipation
            try {
                const { checkAnticipation } = await import('@/app/actions/anticipation');
                const signal = await checkAnticipation(user.id);
                if (signal) setAnticipationSignal(signal);
            } catch (err) {
                console.error('Anticipation check failed', err);
            }

            // 7. Intelligence Context
            setIsSyncingIntel(true);
            const intel = await getOptimizationContextAction(user.id);
            if (intel) setIntelContext(intel);

        } catch (error) {
            console.error('Failed to load Home data:', error);
            showToast('Failed to load dashboard', 'error');
        } finally {
            setIsLoading(false);
            setIsSyncingIntel(false);
        }
    }, [supabase, setProfile, setGoals, setTodayLog, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);


    // Actions
    const handleEnergySet = async (level: number) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const today = new Date().toISOString().split('T')[0];
        await supabase.from('daily_logs').upsert({
            user_id: user.id,
            log_date: today,
            energy_level: level,
        }, { onConflict: 'user_id,log_date' });

        setTodayLog({
            energy_level: level,
            mood: todayLog?.mood || '',
            wins: todayLog?.wins || [],
            challenges: todayLog?.challenges || []
        });

        if (level <= 2 && !profile?.low_energy_mode) {
            updateProfile({ low_energy_mode: true });
            await supabase.from('profiles').update({ low_energy_mode: true }).eq('id', user.id);
            showToast('Low Energy Mode Activated', 'info');
        }
    };

    const refreshBlocks = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const today = new Date().toISOString().split('T')[0];
        const { data: blocksData } = await supabase
            .from('schedule_blocks')
            .select('*, goal:goals(*)')
            .eq('user_id', user.id)
            .eq('date', today)
            .order('start_time', { ascending: true });
        if (blocksData) setTodayBlocks(blocksData);
    };

    const handleCompleteBlock = async (id: string) => {
        setTodayBlocks(prev => prev.map(b => b.id === id ? { ...b, status: 'done' } : b));
        await supabase.from('schedule_blocks').update({ status: 'done' }).eq('id', id);
    };

    // Derived State: Pillar Balance
    const pillarStats = {
        planned: { mind: 0, body: 0, craft: 0 },
        completed: { mind: 0, body: 0, craft: 0 }
    };

    goals.forEach(g => {
        if (g.category in pillarStats.planned) {
            pillarStats.planned[g.category as keyof typeof pillarStats.planned] += (g.minutes_per_day || 0);
        }
    });

    todayBlocks.filter(b => b.status === 'done' && b.goal?.category).forEach(b => {
        if (b.goal && b.goal.category in pillarStats.completed) {
            const duration = (new Date(`1970-01-01T${b.end_time}`).getTime() - new Date(`1970-01-01T${b.start_time}`).getTime()) / 60000;
            pillarStats.completed[b.goal.category as keyof typeof pillarStats.completed] += duration;
        }
    });

    // Progress
    const progress = {
        planned: todayBlocks.reduce((sum, b) => {
            const start = new Date(`1970-01-01T${b.start_time}`);
            const end = new Date(`1970-01-01T${b.end_time}`);
            return sum + (end.getTime() - start.getTime()) / 60000;
        }, 0),
        completed: todayBlocks.filter(b => b.status === 'done').reduce((sum, b) => {
            const start = new Date(`1970-01-01T${b.start_time}`);
            const end = new Date(`1970-01-01T${b.end_time}`);
            return sum + (end.getTime() - start.getTime()) / 60000;
        }, 0)
    };

    return {
        profile,
        goals,
        todayLog,
        todayBlocks,
        isLoading,
        anticipationSignal,
        intelContext,
        isSyncingIntel,
        pillarStats,
        progress,
        refreshBlocks,
        handleEnergySet,
        handleCompleteBlock
    };
}
