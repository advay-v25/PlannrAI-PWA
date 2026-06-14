import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';

export interface CoachAnalytics {
    metrics: {
        planned_minutes: number;
        actual_minutes: number;
        missed_minutes: number;
        execution_rate: number;
    };
    pillar_split: {
        mind: number;
        body: number;
        craft: number;
        uncategorized: number;
    };
    blocks: any[];
    active_goals: any[];
    recentDecisions: any[];
    insights: { text: string; color: string }[];
    strategy: {
        neglectedGoal: string;
        protectedGoal: string;
        bottleneck: string;
        recommendedFocus: string;
    };
}

const fetcher = async () => {
    // 1. Fetch Weekly Summary
    const summaryRes = await apiClient.get<{ data?: any }>('/api/weekly-review/summary');
    const summaryData = summaryRes?.data;

    // 2. Fetch Coach History for Recent Decisions
    const historyRes = await apiClient.get<{ success: boolean; messages: any[] }>('/api/coach/history');
    
    // Process Recent Decisions
    const recentDecisions: any[] = [];
    if (historyRes?.messages) {
        historyRes.messages.forEach(msg => {
            if (msg.role === 'assistant' && msg.selected_option_id && msg.options) {
                const selectedOpt = msg.options.find((o: any) => o.id === msg.selected_option_id);
                if (selectedOpt) {
                    recentDecisions.push({
                        id: msg.id,
                        title: selectedOpt.title || selectedOpt.label || 'Action applied',
                        timestamp: msg.created_at,
                        pillar: selectedOpt.pillar || 'general'
                    });
                }
            }
        });
    }

    // Sort descending by timestamp
    recentDecisions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Process Insights & Strategy locally
    let insights: { text: string; color: string }[] = [];
    let strategy = {
        neglectedGoal: 'None',
        protectedGoal: 'None',
        bottleneck: 'None',
        recommendedFocus: 'None'
    };

    if (summaryData && summaryData.blocks) {
        const blocks = summaryData.blocks;
        const missedBlocks = blocks.filter((b: any) => b.status === 'missed');
        const doneBlocks = blocks.filter((b: any) => b.status === 'done');
        
        // Find most missed goal
        const missedGoalCounts: Record<string, number> = {};
        missedBlocks.forEach((b: any) => {
            if (b.title) missedGoalCounts[b.title] = (missedGoalCounts[b.title] || 0) + 1;
        });

        // Find most protected goal
        const doneGoalCounts: Record<string, number> = {};
        doneBlocks.forEach((b: any) => {
            if (b.title) doneGoalCounts[b.title] = (doneGoalCounts[b.title] || 0) + 1;
        });

        const mostMissed = Object.entries(missedGoalCounts).sort((a, b) => b[1] - a[1])[0];
        const mostDone = Object.entries(doneGoalCounts).sort((a, b) => b[1] - a[1])[0];

        if (mostMissed) strategy.neglectedGoal = mostMissed[0];
        if (mostDone) strategy.protectedGoal = mostDone[0];

        // Pillar focus
        const { mind = 0, body = 0, craft = 0 } = summaryData.pillar_split || {};
        if (mind <= body && mind <= craft) strategy.recommendedFocus = 'Mind';
        else if (body <= mind && body <= craft) strategy.recommendedFocus = 'Body';
        else strategy.recommendedFocus = 'Craft';

        // Insights Generation
        if (mostMissed) {
            insights.push({ text: `You frequently miss ${mostMissed[0]} blocks (${mostMissed[1]} times this week).`, color: 'red' });
        }
        if (mostDone) {
            insights.push({ text: `Great consistency with ${mostDone[0]} (${mostDone[1]} blocks completed).`, color: 'emerald' });
        }
        
        if (missedBlocks.length > 5) {
            insights.push({ text: `High friction detected: ${missedBlocks.length} blocks missed this week.`, color: 'amber' });
            strategy.bottleneck = 'High overall friction';
        } else if (missedBlocks.length > 0) {
            strategy.bottleneck = 'Inconsistent execution';
        } else {
            strategy.bottleneck = 'None detected';
            insights.push({ text: `Perfect execution so far! Momentum is building.`, color: 'orange' });
        }
        
        if (insights.length === 0) {
             insights.push({ text: `Not enough data yet. Complete more blocks to generate insights.`, color: 'orange' });
        }
    }

    return {
        metrics: summaryData?.metrics || { planned_minutes: 0, actual_minutes: 0, missed_minutes: 0, execution_rate: 0 },
        pillar_split: summaryData?.pillar_split || { mind: 0, body: 0, craft: 0, uncategorized: 0 },
        blocks: summaryData?.blocks || [],
        active_goals: summaryData?.active_goals || [],
        recentDecisions: recentDecisions.slice(0, 3), // Top 3
        insights,
        strategy
    };
};

export function useCoachAnalytics() {
    const { data, error, isLoading } = useSWR<CoachAnalytics>('coach-analytics', fetcher, {
        revalidateOnFocus: true,
        refreshInterval: 60000 // 1 min
    });

    return {
        data,
        isLoading,
        error
    };
}
