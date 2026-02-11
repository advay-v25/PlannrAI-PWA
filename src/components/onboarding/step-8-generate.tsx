'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Sparkles, CalendarCheck, RefreshCw, AlertCircle, Lock, Utensils, Moon, Sun } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { format, parseISO, startOfWeek } from 'date-fns';

interface PreviewBlock {
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    block_type: string;
    source?: string;
    is_locked?: boolean;
    pillar?: string;
}

export function Step8Generate() {
    const { data } = useOnboardingStore();
    const [phase, setPhase] = useState<'generating' | 'preview' | 'error'>('generating');
    const [previewBlocks, setPreviewBlocks] = useState<PreviewBlock[]>([]);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [genCount, setGenCount] = useState(0);

    const [thinkingStep, setThinkingStep] = useState(0);
    const thinkingMessages = [
        "Initializing Neural Synthesis Engine...",
        "Calibrating biological energy rhythms...",
        "Mapping high-importance goal vectors...",
        "Resolving commitment conflicts...",
        "Optimizing for maximum life harmony...",
        "Synthesizing Strategic Master Plan...",
        "Donna is finalizing your optimization..."
    ];

    const generateSchedule = useCallback(async () => {
        try {
            const today = new Date();
            const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday

            const response = await apiClient.post<any>('/api/calendar/plan-week', {
                startDate: format(weekStart, 'yyyy-MM-dd'),
            });

            const result = response.data || response;

            if (result.previewBlocks && result.previewBlocks.length > 0) {
                // Sort by date then start_time
                const sorted = [...result.previewBlocks].sort((a: any, b: any) => {
                    const dateComp = a.date.localeCompare(b.date);
                    if (dateComp !== 0) return dateComp;
                    return a.start_time.localeCompare(b.start_time);
                });
                setPreviewBlocks(sorted);
                setPhase('preview');
            } else {
                // Fallback: show static preview from store data
                setPreviewBlocks(buildFallbackPreview());
                setPhase('preview');
            }
        } catch (err) {
            console.error('[Step8] Schedule generation failed:', err);
            // Fallback to static preview
            setPreviewBlocks(buildFallbackPreview());
            setPhase('preview');
        }
    }, [data]);

    const buildFallbackPreview = (): PreviewBlock[] => {
        const today = format(new Date(), 'yyyy-MM-dd');
        const blocks: PreviewBlock[] = [
            { title: 'Wake Up & Hydrate', date: today, start_time: data.sleep_end || '07:00', end_time: addMins(data.sleep_end || '07:00', 15), block_type: 'routine', source: 'planner' },
            { title: 'Breakfast', date: today, start_time: data.meal_windows?.breakfast || '08:00', end_time: addMins(data.meal_windows?.breakfast || '08:00', 30), block_type: 'meal', source: 'meal', is_locked: true },
        ];
        data.goals.forEach((g: any, i: number) => {
            const startHour = 9 + i;
            blocks.push({
                title: g.title,
                date: today,
                start_time: `${String(startHour).padStart(2, '0')}:30`,
                end_time: `${String(startHour + 1).padStart(2, '0')}:00`,
                block_type: 'goal',
                pillar: g.category,
            });
        });
        blocks.push(
            { title: 'Lunch', date: today, start_time: data.meal_windows?.lunch || '12:30', end_time: addMins(data.meal_windows?.lunch || '12:30', 30), block_type: 'meal', source: 'meal', is_locked: true },
            { title: 'Dinner', date: today, start_time: data.meal_windows?.dinner || '19:00', end_time: addMins(data.meal_windows?.dinner || '19:00', 30), block_type: 'meal', source: 'meal', is_locked: true },
            { title: 'Wind Down & Sleep', date: today, start_time: data.sleep_start || '23:00', end_time: addMins(data.sleep_start || '23:00', 30), block_type: 'sleep', source: 'sleep' },
        );
        return blocks;
    };

    // Thinking animation + trigger generation
    useEffect(() => {
        const messageInterval = setInterval(() => {
            setThinkingStep(prev => prev < thinkingMessages.length - 1 ? prev + 1 : prev);
        }, 700);

        // Start real generation after 2s animation
        const timer = setTimeout(() => {
            generateSchedule();
        }, 2000);

        return () => {
            clearTimeout(timer);
            clearInterval(messageInterval);
        };
    }, []);

    const handleRegenerate = async () => {
        if (genCount >= 2) return; // Max 2 regenerations
        setIsRegenerating(true);
        try {
            await generateSchedule();
            setGenCount(prev => prev + 1);
        } finally {
            setIsRegenerating(false);
        }
    };

    if (phase === 'generating') {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-6 text-center">
                <div className="w-24 h-24 relative">
                    <div className="absolute inset-0 border-4 border-[var(--glass-border)] rounded-full" />
                    <div className="absolute inset-0 border-4 border-t-[var(--color-primary)] rounded-full animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-[var(--color-primary)] animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold animate-pulse">Synthesizing Your Week...</h2>
                <motion.p
                    key={thinkingStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-[var(--color-text-secondary)] text-sm max-w-xs h-6"
                >
                    {thinkingMessages[thinkingStep]}
                </motion.p>
            </div>
        );
    }

    // Group blocks by date for multi-day view
    const blocksByDate = previewBlocks.reduce<Record<string, PreviewBlock[]>>((acc, b) => {
        const d = b.date;
        if (!acc[d]) acc[d] = [];
        acc[d].push(b);
        return acc;
    }, {});

    // Show only today + next 2 days for compact preview
    const datesToShow = Object.keys(blocksByDate).sort().slice(0, 3);

    return (
        <div className="h-full flex flex-col w-full max-w-3xl mx-auto">
            <div className="text-center mb-6">
                <h2 className="text-3xl font-display font-light">Your Calibration</h2>
                <p className="text-[var(--color-text-secondary)]">A real schedule generated for your week.</p>
            </div>

            <div className="flex-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-4 overflow-hidden flex flex-col relative">
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5">
                    {datesToShow.map(date => (
                        <div key={date}>
                            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2 sticky top-0 bg-[var(--glass-bg)] py-1 z-10">
                                {formatDateLabel(date)}
                            </p>
                            <div className="space-y-2">
                                {blocksByDate[date].map((block, i) => (
                                    <TimelineItem key={`${date}-${i}`} block={block} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-4 text-[10px] text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Anchor</span>
                    <span className="flex items-center gap-1"><Utensils className="w-3 h-3" /> Meal</span>
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Goal</span>
                </div>

                <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating || genCount >= 2}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg border border-[var(--glass-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                    {genCount >= 2 ? 'Max reached' : 'Regenerate'}
                </button>
            </div>
        </div>
    );
}

function TimelineItem({ block }: { block: PreviewBlock }) {
    const isAnchor = block.source === 'anchor' || block.is_locked;
    const isMeal = block.source === 'meal' || block.block_type === 'meal';
    const isSleep = block.source === 'sleep' || block.block_type === 'sleep';

    const getStyle = () => {
        if (isAnchor) return 'bg-amber-500/10 border-amber-500/40 text-amber-200';
        if (isMeal) return 'bg-orange-500/10 border-orange-500/40 text-orange-200';
        if (isSleep) return 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200';
        return 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200';
    };

    const getIcon = () => {
        if (isAnchor) return <Lock className="w-3 h-3 opacity-60" />;
        if (isMeal) return <Utensils className="w-3 h-3 opacity-60" />;
        if (isSleep) return <Moon className="w-3 h-3 opacity-60" />;
        return <Sparkles className="w-3 h-3 opacity-60" />;
    };

    const startTime = block.start_time?.includes('T')
        ? format(parseISO(block.start_time), 'HH:mm')
        : block.start_time;
    const endTime = block.end_time?.includes('T')
        ? format(parseISO(block.end_time), 'HH:mm')
        : block.end_time;

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${getStyle()}`}
        >
            {getIcon()}
            <span className="font-mono text-[11px] w-24 opacity-70">{startTime} – {endTime}</span>
            <span className="text-sm font-medium flex-1 truncate">{block.title}</span>
            {isAnchor && <span className="text-[9px] font-mono opacity-40">LOCKED</span>}
        </motion.div>
    );
}

// Helpers
function addMins(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string): string {
    try {
        const d = parseISO(dateStr);
        const today = new Date();
        if (format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) return 'Today';
        return format(d, 'EEEE, MMM d');
    } catch {
        return dateStr;
    }
}
