'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { useHabitStacksStore, useUserStore } from '@/stores';
import { habitStacksApi, type HabitStack, apiClient } from '@/lib/api-client';
import type { ScheduleBlock, Goal, Database } from '@/types/database';
import type { Patch } from '@/lib/ai/schemas';
import {
    Link as LinkIcon,
    Plus,
    X,
    Check,
    Flame,
    Trophy,
    Clock,
    ChevronRight,
    Sparkles,
    Bot,
    MessageCircle,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { HabitGrid } from './habit-grid';
import { createClient } from '@/lib/supabase/client';

type HabitInstance = Database['public']['Tables']['habit_instances']['Row'];

// Helper to sanitize DB data for Store (which expects numbers not nulls)
const sanitizeStack = (s: HabitStack): any => ({
    ...s,
    action_duration_mins: s.action_duration_mins ?? 5,
    current_streak: s.current_streak ?? 0,
    longest_streak: s.longest_streak ?? 0,
    total_completions: s.total_completions ?? 0,
    grace_days_used: s.grace_days_used ?? 0,
    max_grace_days: s.max_grace_days ?? 1,
    is_active: s.is_active ?? true,
});

/**
 * Habit Stack Card - Individual habit stack with completion
 */
interface HabitStackCardProps {
    stack: HabitStack;
    instances?: HabitInstance[];
    onComplete?: () => void;
    onDelete?: () => void;
}

export function HabitStackCard({ stack, instances = [], onComplete, onDelete }: HabitStackCardProps) {
    const [isCompleting, setIsCompleting] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);
    const { completeStack, updateStack } = useHabitStacksStore();

    const isCompletedToday = stack.last_completed === new Date().toISOString().split('T')[0];
    const currentStreak = stack.current_streak ?? 0;
    const longestStreak = stack.longest_streak ?? 0;
    const duration = stack.action_duration_mins ?? 5;

    const handleComplete = async () => {
        if (isCompletedToday || isCompleting) return;

        setIsCompleting(true);

        try {
            const result = await habitStacksApi.complete(stack.id);

            if (result.success && result.data) {
                updateStack(stack.id, sanitizeStack(result.data.stack));

                // Show celebration for new records
                if (result.data.streakInfo?.isNewRecord) {
                    setShowCelebration(true);
                    setTimeout(() => setShowCelebration(false), 2000);
                }

                onComplete?.();
            }
        } catch (error) {
            console.error('Failed to complete habit stack:', error);
        } finally {
            setIsCompleting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
        >
            {/* Celebration overlay */}
            <AnimatePresence>
                {showCelebration && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 flex items-center justify-center z-10 bg-[var(--color-bg-primary)]/80 rounded-2xl"
                    >
                        <div className="text-center">
                            <Trophy className="w-12 h-12 text-[var(--color-future)] mx-auto mb-2" />
                            <p className="font-semibold text-[var(--color-future)]">New Record!</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`glass-card p-4 ${isCompletedToday ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-4">
                    {/* Complete Button */}
                    <motion.button
                        onClick={handleComplete}
                        disabled={isCompletedToday || isCompleting}
                        className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isCompletedToday
                            ? 'bg-[var(--color-success)] text-white'
                            : 'bg-[var(--glass-bg)] hover:bg-[var(--color-success-soft)] text-[var(--text-tertiary)]'
                            }`}
                        whileHover={{ scale: isCompletedToday ? 1 : 1.05 }}
                        whileTap={{ scale: isCompletedToday ? 1 : 0.95 }}
                    >
                        {isCompletedToday ? (
                            <Check className="w-6 h-6" />
                        ) : (
                            <LinkIcon className="w-5 h-5" />
                        )}
                    </motion.button>

                    {/* Stack Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                            <span>After</span>
                            <span className="font-medium text-[var(--text-primary)]">{stack.trigger_habit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-[var(--color-primary)]" />
                            <span className="font-medium">{stack.action_habit}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                                ({duration}m)
                            </span>
                        </div>
                    </div>

                    {/* Streak */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--glass-bg)]">
                        <Flame className={`w-4 h-4 ${currentStreak > 0 ? 'text-orange-500' : 'text-[var(--text-tertiary)]'}`} />
                        <span className="text-sm font-semibold">{currentStreak}</span>
                    </div>
                </div>

                {/* Grid Visualization */}
                <div className="mt-4 pt-3 border-t border-[var(--glass-border)]">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">Consistency</span>
                        {longestStreak > 0 && (
                            <span className="text-[10px] text-[var(--text-tertiary)]">Best: {longestStreak} days</span>
                        )}
                    </div>
                    <HabitGrid stackId={stack.id} instances={instances} />
                </div>
            </div>
        </motion.div>
    );
}

/**
 * Create Habit Stack Form
 */
interface CreateHabitStackProps {
    goalId?: string;
    onCreated?: (stack: HabitStack) => void;
    onCancel?: () => void;
}

export function CreateHabitStack({ goalId, onCreated, onCancel }: CreateHabitStackProps) {
    const [triggerHabit, setTriggerHabit] = useState('');
    const [actionHabit, setActionHabit] = useState('');
    const [duration, setDuration] = useState(5);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addStack } = useHabitStacksStore();

    const TRIGGER_SUGGESTIONS = [
        'After morning coffee',
        'After brushing teeth',
        'After lunch',
        'When I sit at my desk',
        'After dinner',
        'Before bed',
    ];

    const handleSubmit = async () => {
        if (!triggerHabit.trim() || !actionHabit.trim()) return;

        setIsSubmitting(true);

        try {
            const result = await habitStacksApi.create({
                trigger_habit: triggerHabit.trim(),
                action_habit: actionHabit.trim(),
                goal_id: goalId,
                action_duration_mins: duration,
            });

            if (result.success && result.data?.stack) {
                const s = sanitizeStack(result.data.stack);
                addStack(s);
                onCreated?.(s);
                setTriggerHabit('');
                setActionHabit('');
                setDuration(5);
            }
        } catch (error) {
            console.error('Failed to create habit stack:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
        >
            <div className="glass-card glass-primary p-5 space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-heading flex items-center gap-2">
                        <LinkIcon className="w-5 h-5 text-[var(--color-primary)]" />
                        Create Habit Stack
                    </h3>
                    {onCancel && (
                        <button onClick={onCancel} className="p-2 rounded-full hover:bg-[var(--glass-bg)]">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Trigger */}
                <div className="space-y-2">
                    <label className="text-overline">After I...</label>
                    <GlassInput
                        placeholder="e.g., finish my morning coffee"
                        value={triggerHabit}
                        onChange={(e) => setTriggerHabit(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        {TRIGGER_SUGGESTIONS.map((suggestion) => (
                            <button
                                key={suggestion}
                                onClick={() => setTriggerHabit(suggestion)}
                                className="text-xs px-2 py-1 rounded-full bg-[var(--glass-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Action */}
                <div className="space-y-2">
                    <label className="text-overline">I will...</label>
                    <GlassInput
                        placeholder="e.g., meditate for 5 minutes"
                        value={actionHabit}
                        onChange={(e) => setActionHabit(e.target.value)}
                    />
                </div>

                {/* Duration */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-overline">Duration</label>
                        <span className="text-sm font-medium text-[var(--color-primary)]">{duration} min</span>
                    </div>
                    <input
                        type="range"
                        min={1}
                        max={30}
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value))}
                        className="w-full h-2 bg-[var(--glass-bg)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)]"
                    />
                </div>

                <GlassButton
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={!triggerHabit.trim() || !actionHabit.trim() || isSubmitting}
                    className="w-full"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Create Stack
                </GlassButton>
            </div>
        </motion.div>
    );
}

/**
 * AI-Powered Habit Stack Creator
 */
interface CreateHabitStackWithAIProps {
    onCreated: () => void;
    onCancel: () => void;
    todayBlocks?: ScheduleBlock[];
    goals?: Goal[];
    profile?: any;
    onBlocksUpdated?: () => void;
}

function CreateHabitStackWithAI({ onCreated, onCancel, todayBlocks = [], goals = [], profile, onBlocksUpdated }: CreateHabitStackWithAIProps) {
    const [step, setStep] = useState<'input' | 'chat' | 'confirm'>('input');
    const [habitName, setHabitName] = useState('');
    const [messages, setMessages] = useState<Array<{ role: 'assistant' | 'user', content: string }>>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [generatedStack, setGeneratedStack] = useState<HabitStack | null>(null);
    const [options, setOptions] = useState<any[]>([]);
    const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);
    const { addStack } = useHabitStacksStore();

    // Initial message
    useEffect(() => {
        if (step === 'chat' && messages.length === 0) {
            startConversation();
        }
    }, [step]);

    const buildAIContext = () => ({
        mode: 'chat',
        profile: {
            wake_up: (profile as any)?.sleep_end || '07:00',
            sleep_start: (profile as any)?.sleep_start || '23:00'
        },
        current_schedule: todayBlocks.map(b => ({
            id: b.id,
            title: b.title || b.context,
            start_time: b.start_time,
            end_time: b.end_time,
            block_type: b.block_type,
            is_fixed: b.is_fixed,
        })),
        goals: goals.map(g => ({
            id: g.id,
            title: g.title,
            category: g.category,
            importance: g.importance,
        })),
    });

    const extractStacksAndOptions = (aiData: any) => {
        if (aiData.stacks && aiData.stacks.length > 0) {
            const stack = aiData.stacks[0];
            setGeneratedStack({
                trigger_habit: stack.steps?.[0]?.trigger || stack.name,
                action_habit: stack.steps?.[0]?.title || stack.name,
                action_duration_mins: stack.steps?.[0]?.minutes || 5,
                id: '', user_id: '',
                current_streak: 0, longest_streak: 0,
                total_completions: 0, grace_days_used: 0, max_grace_days: 1,
                is_active: true,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString()
            } as any);

            if (aiData.options && aiData.options.length > 0) {
                setOptions(aiData.options);
                setSelectedOptionIndex(0);
                setStep('confirm');
                return true;
            }
        }
        return false;
    };

    const startConversation = async () => {
        setIsLoading(true);
        try {
            const aiData = (await apiClient.ai.execute({
                channel: 'habit_stack',
                input: `I want to build a habit: ${habitName}`,
                context: buildAIContext()
            })) as any;

            if (aiData.summary || aiData.stacks) {
                if (!extractStacksAndOptions(aiData)) {
                    setMessages([{
                        role: 'assistant',
                        content: aiData.summary || "Tell me more about when you'd like to do this habit."
                    }]);
                }
            }
        } catch (error) {
            console.error('AI Error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!userInput.trim()) return;

        const newMessages = [
            ...messages,
            { role: 'user' as const, content: userInput }
        ];
        setMessages(newMessages);
        setUserInput('');
        setIsLoading(true);

        try {
            const aiData = (await apiClient.ai.execute({
                channel: 'habit_stack',
                input: userInput,
                context: {
                    ...buildAIContext(),
                    history: newMessages.map(m => ({ role: m.role, content: m.content })),
                    habit_goal: habitName
                }
            })) as any;

            if (aiData.summary || aiData.stacks) {
                if (!extractStacksAndOptions(aiData)) {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: aiData.summary || "I'm still thinking. Tell me more."
                    }]);
                }
            }
        } catch (error) {
            console.error('AI Error:', error);
        } finally {
            setIsLoading(false);
        }
    };


    const handleConfirm = async () => {
        if (!generatedStack) return;
        setIsLoading(true);

        try {
            // 1. Create habit stack (using existing helper for simplicity)
            const result = await habitStacksApi.create({
                trigger_habit: generatedStack.trigger_habit,
                action_habit: generatedStack.action_habit,
                action_duration_mins: generatedStack.action_duration_mins ?? 5,
            });

            if (result.success && result.data?.stack) {
                addStack(sanitizeStack(result.data.stack));

                // 2. Apply calendar mutation if we have options
                const selectedOption = options[selectedOptionIndex];
                if (selectedOption?.patch) {
                    try {
                        const patch: Patch = {
                            ...selectedOption.patch,
                            undoable: true,
                            reason: selectedOption.patch.reason || 'Habit stack placement'
                        };

                        // Inject habit_stack_id into any create_event ops
                        patch.ops = patch.ops.map((op: any) => {
                            if (op.op === 'create_event') {
                                return {
                                    ...op,
                                    payload: {
                                        ...op.payload,
                                        habit_stack_id: result.data.stack.id
                                    }
                                };
                            }
                            return op;
                        });

                        await apiClient.patch.apply(patch, 'habit_stack');
                        onBlocksUpdated?.();
                    } catch (e) {
                        console.warn('Calendar mutation failed, stack still created:', e);
                    }
                }

                onCreated();
            }
        } catch (error) {
            console.error('Failed to create:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
        >
            <div className="glass-card glass-primary p-5 space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-heading flex items-center gap-2">
                        <Bot className="w-5 h-5 text-[var(--color-primary)]" />
                        Build with AI
                    </h3>
                    <button onClick={onCancel} className="p-2 rounded-full hover:bg-[var(--glass-bg)]">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {step === 'input' && (
                    <div className="space-y-4">
                        <p className="text-sm text-[var(--text-secondary)]">
                            Tell me what habit you want to build, and I'll design the perfect stack for you.
                        </p>
                        <GlassInput
                            placeholder="e.g., Daily Meditation, Read more books..."
                            value={habitName}
                            onChange={(e) => setHabitName(e.target.value)}
                            autoFocus
                        />
                        <GlassButton
                            variant="primary"
                            onClick={() => setStep('chat')}
                            disabled={!habitName.trim()}
                            className="w-full"
                        >
                            Start Building <Sparkles className="w-4 h-4 ml-2" />
                        </GlassButton>
                    </div>
                )}

                {step === 'chat' && (
                    <div className="space-y-4">
                        <div className="max-h-[300px] overflow-y-auto space-y-3 p-2 custom-scrollbar">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user'
                                        ? 'bg-[var(--color-primary)] text-white'
                                        : 'bg-[var(--glass-bg)] text-[var(--text-primary)]'
                                        }`}>
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-[var(--glass-bg)] p-3 rounded-2xl">
                                        <Loader2 className="w-4 h-4 animate-spin text-[var(--text-tertiary)]" />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <GlassInput
                                placeholder="Type your answer..."
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            />
                            <GlassButton
                                variant="primary"
                                onClick={handleSendMessage}
                                disabled={!userInput.trim() || isLoading}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </GlassButton>
                        </div>
                    </div>
                )}

                {step === 'confirm' && generatedStack && (
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--color-primary)]/30">
                            <p className="text-xs text-[var(--color-primary)] font-bold uppercase tracking-wider mb-2">
                                YOUR PERSONALIZED STACK
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm text-[var(--text-tertiary)]">When</p>
                                    <p className="font-medium">{generatedStack.trigger_habit}</p>
                                </div>
                                <div className="flex justify-center">
                                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] rotate-90" />
                                </div>
                                <div>
                                    <p className="text-sm text-[var(--text-tertiary)]">Then</p>
                                    <p className="font-medium">{generatedStack.action_habit}</p>
                                </div>
                                <div className="pt-2 border-t border-[var(--glass-border)] flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <Clock className="w-4 h-4" />
                                    {generatedStack.action_duration_mins ?? 5} minutes
                                </div>
                                {options.length > 0 && (
                                    <div className="pt-2 border-t border-[var(--glass-border)] space-y-2">
                                        <p className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold">Select Placement</p>
                                        <div className="flex flex-col gap-2">
                                            {options.map((opt, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setSelectedOptionIndex(idx)}
                                                    className={`text-left p-2 rounded-lg text-xs transition-all border ${selectedOptionIndex === idx
                                                        ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-[var(--color-primary)]'
                                                        : 'bg-[var(--glass-bg)] border-transparent text-[var(--text-secondary)] hover:border-[var(--glass-border)]'
                                                        }`}
                                                >
                                                    <span className="font-semibold block">{opt.label}</span>
                                                    {opt.patch?.ops?.[0]?.payload && (
                                                        <span className="opacity-70">
                                                            📅 {opt.patch.ops[0].payload.start_time} – {opt.patch.ops[0].payload.end_time}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <GlassButton
                                variant="ghost"
                                onClick={() => setStep('input')}
                                className="flex-1"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Try Again
                            </GlassButton>
                            <GlassButton
                                variant="primary"
                                onClick={handleConfirm}
                                disabled={isLoading}
                                className="flex-1"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Check className="w-4 h-4 mr-2" />
                                )}
                                Save Stack
                            </GlassButton>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

interface HabitStacksListProps {
    todayBlocks?: ScheduleBlock[];
    goals?: Goal[];
    onBlocksUpdated?: () => void;
}

export function HabitStacksList({ todayBlocks = [], goals = [], onBlocksUpdated }: HabitStacksListProps) {
    const [creationMode, setCreationMode] = useState<'manual' | 'ai' | null>(null);
    const { stacks, setStacks, setLoading, isLoading } = useHabitStacksStore();
    const [allInstances, setAllInstances] = useState<HabitInstance[]>([]);

    useEffect(() => {
        async function loadData() {
            try {
                // Load Stacks
                const result = await habitStacksApi.list();
                if (result.success && result.data?.stacks) {
                    setStacks(result.data.stacks.map(sanitizeStack));
                }

                // Load History (Last 28 days)
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const today = new Date();
                    const past = new Date(today);
                    past.setDate(past.getDate() - 30);

                    const { data: history } = await supabase
                        .from('habit_instances')
                        .select('*')
                        .eq('user_id', user.id)
                        .gte('date', past.toISOString().split('T')[0]);

                    if (history) setAllInstances(history);
                }

            } catch (error) {
                console.error('Failed to load habit data:', error);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [setStacks, setLoading]);

    // Today's stacks (not yet completed today)
    const todaysStacks = stacks.filter(s =>
        s.is_active && s.last_completed !== new Date().toISOString().split('T')[0]
    );
    const completedToday = stacks.filter(s =>
        s.is_active && s.last_completed === new Date().toISOString().split('T')[0]
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-heading">Habit Stacks</h3>
                    <p className="text-caption">
                        {completedToday.length} of {stacks.filter(s => s.is_active).length} completed today
                    </p>
                </div>
                {!creationMode && (
                    <div className="flex gap-2">
                        <GlassButton
                            variant="primary"
                            size="sm"
                            onClick={() => setCreationMode('ai')}
                        >
                            <Sparkles className="w-4 h-4" />
                            AI Assist
                        </GlassButton>
                        <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={() => setCreationMode('manual')}
                        >
                            <Plus className="w-4 h-4" />
                            Custom
                        </GlassButton>
                    </div>
                )}
            </div>

            {/* Create Forms */}
            <AnimatePresence mode="wait">
                {creationMode === 'manual' && (
                    <CreateHabitStack
                        onCreated={() => setCreationMode(null)}
                        onCancel={() => setCreationMode(null)}
                    />
                )}
                {creationMode === 'ai' && (
                    <CreateHabitStackWithAI
                        onCreated={() => setCreationMode(null)}
                        onCancel={() => setCreationMode(null)}
                        todayBlocks={todayBlocks}
                        goals={goals}
                        profile={useUserStore.getState().profile}
                        onBlocksUpdated={onBlocksUpdated}
                    />
                )}
            </AnimatePresence>

            {/* Today's Stacks */}
            {todaysStacks.length > 0 && !creationMode && (
                <div className="space-y-3">
                    {todaysStacks.map((stack) => (
                        <HabitStackCard
                            key={stack.id}
                            stack={stack as unknown as HabitStack}
                            instances={allInstances.filter(i => i.habit_stack_id === stack.id)}
                        />
                    ))}
                </div>
            )}

            {/* Completed Today */}
            {completedToday.length > 0 && !creationMode && (
                <div className="space-y-3">
                    <p className="text-overline text-[var(--color-success)]">✓ Completed today</p>
                    {completedToday.map((stack) => (
                        <HabitStackCard
                            key={stack.id}
                            stack={stack as unknown as HabitStack}
                            instances={allInstances.filter(i => i.habit_stack_id === stack.id)}
                        />
                    ))}
                </div>
            )}

            {/* Empty State */}
            {stacks.length === 0 && !isLoading && !creationMode && (
                <div className="glass-card p-8 text-center">
                    <LinkIcon className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                    <h4 className="font-medium mb-2">No habit stacks yet</h4>
                    <p className="text-caption mb-4">
                        Link new habits to existing ones for easy adoption
                    </p>
                    <GlassButton variant="primary" onClick={() => setCreationMode('ai')}>
                        <Plus className="w-4 h-4" />
                        Create First Stack With AI
                    </GlassButton>
                </div>
            )}
        </div>
    );
}
