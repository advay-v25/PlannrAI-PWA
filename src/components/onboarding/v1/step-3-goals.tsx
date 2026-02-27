'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Send, CheckCircle2, Bot, BrainCircuit, Activity, Wrench } from 'lucide-react';
import { useChat } from '@ai-sdk/react';

export function Step3Goals() {
    const { data, updateData } = useOnboardingStore();
    const bottomRef = useRef<HTMLDivElement>(null);
    const [goalsComplete, setGoalsComplete] = useState(false);
    const [input, setInput] = useState('');

    // Naive capacity math for V1 Onboarding
    const totalSleepHours = (typeof data.sleep_end === 'string' && typeof data.sleep_start === 'string')
        ? 8 // simplified for UI demo
        : 8;
    const totalCommitmentHours = data.commitments.length * 2; // rough estimate
    const totalRoutineHours = (data.meals_per_day * 0.5) + (data.wind_down_mins / 60);
    const totalAvailableHoursWeek = 168 - (totalSleepHours * 7) - (totalCommitmentHours * 7) - (totalRoutineHours * 7);

    const usedHours = data.goals.reduce((acc, g) => acc + (g.suggested_hours_week || 0), 0);
    const remainingHours = Math.max(0, totalAvailableHoursWeek - usedHours);
    const capacityPercentage = Math.min(100, Math.round((usedHours / totalAvailableHoursWeek) * 100)) || 0;

    const { messages, sendMessage, status } = useChat({
        api: '/api/onboarding/conversation',
        body: {
            step: 'goals',
            userName: data.full_name,
        },
        initialMessages: [
            {
                id: '1',
                role: 'assistant',
                content: `Boundaries locked. You have roughly ${Math.round(totalAvailableHoursWeek)} hours of liquid capacity this week.\n\nNow, what are we executing? Tell me your top 1-3 goals for the next 90 days across Mind, Body, and Craft. Keep it concise.`
            }
        ]
    } as any);

    const isLoading = status === 'loading' || status === 'streaming';

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const currentInput = input;
        setInput('');
        await sendMessage({ text: currentInput });
    };

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }

        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.content.includes('EXTRACTION_COMPLETE')) {
            try {
                const jsonMatch = lastMessage.content.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    const extracted = JSON.parse(jsonMatch[1]);
                    console.log("Extracted goals:", extracted);

                    const newGoals: any[] = [];
                    Object.entries(extracted.identified_goals || {}).forEach(([title, details]: [string, any]) => {
                        newGoals.push({
                            title,
                            description: details.description || '',
                            category: details.pillar || 'craft',
                            suggested_hours_week: details.estimated_hours_per_week || 5,
                            importance: 'high'
                        });
                    });

                    updateData({ goals: newGoals });

                    if (extracted.clarification_needed === false && newGoals.length > 0) {
                        setGoalsComplete(true);
                    }
                }
            } catch (e) {
                console.error("Failed to parse goal extraction", e);
            }
        }
    }, [messages, updateData]);

    const getPillarIcon = (category: string) => {
        switch (category.toLowerCase()) {
            case 'mind': return <BrainCircuit size={16} className="text-purple-400" />;
            case 'body': return <Activity size={16} className="text-green-400" />;
            default: return <Wrench size={16} className="text-orange-400" />;
        }
    };

    return (
        <div className="flex flex-col h-full w-full max-w-2xl mx-auto">
            {/* Liquid Capacity Visualizer */}
            <div className="w-full bg-[var(--glass-surface)] border border-[var(--glass-border)] rounded-xl p-4 mb-4 flex flex-col gap-2">
                <div className="flex justify-between items-center text-sm font-mono text-[var(--color-text-secondary)] uppercase">
                    <span>Liquid Capacity Tracker</span>
                    <span className={remainingHours < 5 ? 'text-red-400' : 'text-[var(--color-primary)]'}>
                        {Math.round(remainingHours)} hrs remaining
                    </span>
                </div>
                <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden">
                    <motion.div
                        className={`h-full ${capacityPercentage > 90 ? 'bg-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]' : 'bg-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary)]'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${capacityPercentage}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>

                {data.goals.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {data.goals.map((g, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-md text-xs font-mono"
                            >
                                {getPillarIcon(g.category)}
                                <span>{g.title}</span>
                                <span className="text-white/50">{g.suggested_hours_week}h/wk</span>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 p-4 min-h-[300px] pb-24 scrollbar-hide">
                {messages.map((m: any) => {
                    const isAi = m.role === 'assistant';
                    if (m.content.includes('EXTRACTION_COMPLETE')) return null;

                    return (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${isAi ? 'justify-start' : 'justify-end'}`}
                        >
                            <div className={`flex max-w-[85%] ${isAi ? 'flex-row' : 'flex-row-reverse'} gap-3 items-end`}>
                                {isAi && (
                                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0 border border-[var(--color-primary)]/40 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.2)]">
                                        <Bot size={16} className="text-[var(--color-primary)]" />
                                    </div>
                                )}
                                <div className={`px-4 py-3 rounded-2xl text-sm md:text-base ${isAi
                                        ? 'bg-[var(--glass-surface)] border border-[var(--glass-border)] text-white/90 rounded-bl-sm'
                                        : 'bg-[var(--color-primary)] text-black font-medium border border-[var(--color-primary)]/50 rounded-br-sm'
                                    }`}>
                                    {m.content}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
                {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                        <div className="flex flex-row gap-3 items-end">
                            <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0 border border-[var(--color-primary)]/40">
                                <Bot size={16} className="text-[var(--color-primary)] animate-pulse" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl bg-[var(--glass-surface)] border border-[var(--glass-border)] rounded-bl-sm flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </motion.div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="relative pt-4 w-full">
                {goalsComplete ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-[var(--color-glass)] border border-[var(--color-primary)] text-[var(--color-primary)] py-4 rounded-xl flex items-center justify-center gap-3 font-mono text-sm uppercase tracking-wider shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.1)]"
                    >
                        <CheckCircle2 size={18} />
                        Targets Confirmed. Proceed.
                    </motion.div>
                ) : (
                    <form onSubmit={handleFormSubmit} className="relative flex items-center w-full">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type your goals..."
                            className="bg-[var(--glass-surface)] border-[var(--glass-border)] focus:border-[var(--color-primary)] text-white pr-14 py-6 rounded-xl w-full font-mono text-sm placeholder:text-gray-600"
                            disabled={isLoading}
                            autoFocus
                        />
                        <GlassButton
                            type="submit"
                            variant="primary"
                            disabled={isLoading || !input.trim()}
                            className="absolute right-2 px-3 py-2 rounded-lg"
                        >
                            <Send size={18} />
                        </GlassButton>
                    </form>
                )}
            </div>
        </div>
    );
}
