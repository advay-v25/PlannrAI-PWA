'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Components
import { TimelineStrip } from '@/components/home/timeline-strip';
import { NextUpCard } from '@/components/home/next-up-card';
import { TodayChecklist } from '@/components/home/today-checklist';
import { HabitStacks } from '@/components/home/habit-stacks';
import { RealityIntake } from '@/components/home/reality-intake';
import { HomeHeader } from '@/components/home/home-header';

export default function HomePage() {
    const supabase = createClient();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchHomeData = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await fetch(`/api/home/summary?date=${today}`);
            if (res.ok) {
                const json = await res.json();
                setData(json.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchHomeData();
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchHomeData();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-[var(--color-text-tertiary)] font-mono text-sm">
                Loading Mission Control...
            </div>
        );
    }

    if (!data) return <div className="p-8 text-white">System Error. Check Network.</div>;

    return (
        <div className="min-h-screen bg-black text-white pb-32">

            {/* A. Header */}
            <HomeHeader
                date={data.date}
                metrics={data.metrics}
                userState={data.user_state}
                insight={data.insight}
            />

            <main className="max-w-md mx-auto px-4 space-y-8 mt-6">

                {/* B. Mini Calendar Strip */}
                <section>
                    <TimelineStrip blocks={data.schedule_blocks} anchors={data.anchors} />
                </section>

                {/* C. "Next Up" Focus Card */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-3">
                        Required Action
                    </h2>
                    <NextUpCard nextBlock={data.next_up} onAction={handleRefresh} />
                </section>

                {/* D. Today Checklist (Subtasks) */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-3 flex items-center justify-between">
                        <span>Execution Log</span>
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full">{data.tasks?.length || 0} ITEMS</span>
                    </h2>
                    <TodayChecklist tasks={data.tasks} onUpdate={handleRefresh} />
                </section>

                {/* E. Habit Stacks (AI Assist) */}
                <section>
                    <HabitStacks stacks={data.habit_stacks} onUpdate={handleRefresh} />
                </section>

            </main>

            {/* F. Reality Intake (Floating) */}
            <RealityIntake onUpdate={handleRefresh} />

        </div>
    );
}
