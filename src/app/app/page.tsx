'use client';

import { useState, useEffect, useRef } from 'react';
import { HomeLayout } from '@/components/home/home-layout';
import { NowCard } from '@/components/home/now-card';
import { TimelineStrip } from '@/components/home/timeline-strip';
import { StacksModule } from '@/components/home/stacks-module';
import { BriefingModule } from '@/components/home/briefing-module';
import { InsightsCard } from '@/components/home/insights-card';
import { PrioritiesCard } from '@/components/home/priorities-card';
import { EnergyCheckin } from '@/components/home/energy-checkin';
import { AIProfileBadge } from '@/components/home/ai-profile-badge';
import { RealityIntake } from '@/components/home/reality-intake';
import { format } from 'date-fns';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function HomePage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [briefing, setBriefing] = useState<string | undefined>(undefined);
    const [briefingTone, setBriefingTone] = useState<string | undefined>(undefined);
    const [priorities, setPriorities] = useState<string[]>([]);
    const [briefingLoading, setBriefingLoading] = useState(false);

    const briefingAttempted = useRef(false);

    const fetchHomeData = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await fetch(`/api/home/summary?date=${today}`);
            if (res.ok) {
                const json = await res.json();
                setData(json.data);
                if (json.data.briefing) setBriefing(json.data.briefing);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHomeData();
    }, []);

    // Auto-fire briefing if missing and data loaded
    useEffect(() => {
        if (!loading && data && !briefing && !briefingLoading && !briefingAttempted.current) {
            handleGenerateBriefing();
        }
    }, [loading, data, briefing, briefingLoading]);

    const handleRefresh = () => {
        fetchHomeData();
    };

    const handleGenerateBriefing = async () => {
        setBriefingLoading(true);
        briefingAttempted.current = true;
        try {
            const res = await fetch('/api/narrative/briefing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: new Date().toISOString().split('T')[0] })
            });
            if (res.ok) {
                const json = await res.json();
                setBriefing(json.data?.briefing);
                setBriefingTone(json.data?.tone);
                setPriorities(json.data?.priorities || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setBriefingLoading(false);
        }
    };

    const handleEnergyCheckin = async (energy: number, mood: string) => {
        try {
            await fetch('/api/home/energy-checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    energy_level: energy,
                    emotional_state: mood
                })
            });
            // Update local data immediately
            setData((prev: any) => prev ? {
                ...prev,
                user_state: { ...prev.user_state, energy_level: energy, emotional_state: mood }
            } : prev);
        } catch (e) {
            console.error('Energy checkin failed:', e);
            toast.error('Failed to save check-in');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-[var(--color-text-tertiary)] gap-4">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono uppercase tracking-widest animate-pulse">Initializing VisionOS...</span>
            </div>
        );
    }

    if (!data) return <div className="p-8 text-white">System Error. Check Network.</div>;

    // Header Content
    const header = (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-4xl font-bold text-white tracking-tight">Today</h1>
                <p className="text-sm text-white/40 font-mono mt-1">
                    {format(new Date(), 'EEEE, MMMM do')}
                </p>
            </div>
            <div className="flex items-center gap-4">
                <div className="hidden md:block text-right">
                    <div className="text-xs font-bold text-white/60">
                        {Math.round(data.metrics.completed_min / 60)}h {Math.round(data.metrics.completed_min % 60)}m DONE
                    </div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest">
                        {Math.round(data.metrics.planned_min / 60)}h {Math.round(data.metrics.planned_min % 60)}m PLANNED
                    </div>
                </div>
                <Link href="/app/settings">
                    <button className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <Settings className="w-5 h-5" />
                    </button>
                </Link>
            </div>
        </div>
    );

    return (
        <HomeLayout
            header={header}
            realityIntake={
                <RealityIntake
                    onUpdate={handleRefresh}
                />
            }
            nowCard={
                <NowCard
                    block={data.next_up}
                    onAction={handleRefresh}
                />
            }
            timeline={
                <TimelineStrip
                    blocks={data.schedule_blocks}
                    anchors={data.anchors}
                />
            }
            energyCheckin={
                <EnergyCheckin
                    currentEnergy={data.user_state?.energy_level > 0 ? data.user_state.energy_level : undefined}
                    currentMood={data.user_state?.emotional_state !== 'neutral' ? data.user_state.emotional_state : undefined}
                    onCheckin={handleEnergyCheckin}
                />
            }
            briefing={
                <BriefingModule
                    briefing={briefing}
                    isLoading={briefingLoading}
                    onGenerate={handleGenerateBriefing}
                />
            }
            priorities={
                priorities.length > 0 ? (
                    <PrioritiesCard
                        priorities={priorities}
                        tone={briefingTone}
                    />
                ) : undefined
            }
            aiProfile={
                data.ai_profile ? (
                    <AIProfileBadge aiProfile={data.ai_profile} />
                ) : undefined
            }
            insights={
                <InsightsCard
                    userState={data.user_state}
                    insight={data.insight}
                />
            }
            stacks={
                <StacksModule
                    stacks={data.habit_stacks}
                    onUpdate={handleRefresh}
                />
            }
        />
    );
}
