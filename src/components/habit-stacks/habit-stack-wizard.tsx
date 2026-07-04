import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    X,
    ArrowRight,
    Check,
    RotateCcw,
    Layers,
    Clock,
    Calendar,
    ChevronRight,
    Loader2
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useHabitStacksStore } from '@/stores';
import type { HabitStack } from '@/lib/api-client';

interface HabitStackWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'input' | 'processing' | 'review' | 'success';

export function HabitStackWizard({ isOpen, onClose, onSuccess }: HabitStackWizardProps) {
    const { addStack } = useHabitStacksStore();
    const { showToast } = useToast();

    const [step, setStep] = useState<Step>('input');
    const [habitIdea, setHabitIdea] = useState('');
    const [generatedStacks, setGeneratedStacks] = useState<any[]>([]);
    const [selectedStackIdx, setSelectedStackIdx] = useState(0);
    const [placements, setPlacements] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(false);

    // 1. Generate Stacks
    const handleGenerate = async () => {
        if (!habitIdea.trim()) return;

        setStep('processing');
        setIsLoading(true);

        try {
            const response = await apiClient.ai.execute({
                channel: 'habit_stack',
                input: habitIdea,
                context: {
                    // Context is built by server or default empty if not needed for initial generation
                    // But here we rely on the server to fetch profile/schedule if needed,
                    // or we can pass minimal context. 
                    // For now, let's keep it simple as the prompt handles it.
                }
            });

            // Handle strict schema
            if (response.stacks && response.stacks.length > 0) {
                setGeneratedStacks(response.stacks);
                if (response.options) {
                    setPlacements(response.options);
                }
                setStep('review');
            } else {
                throw new Error("AI could not design a stack for this.");
            }

        } catch (error: any) {
            console.error("Habit Gen Failed:", error);
            showToast(error.message || "Failed to generate habit stack", 'error');
            setStep('input');
        } finally {
            setIsLoading(false);
        }
    };

    // 2. Save Stack
    const handleSave = async (placementIdx?: number) => {
        const stack = generatedStacks[selectedStackIdx];
        if (!stack) return;

        setIsLoading(true);
        try {
            // A. Create Stack in DB
            // We use the first step as the main trigger/action logic for now
            // or if the AI returns a 'name', we can be more flexible. 
            // The DB schema is rigid (trigger_habit, action_habit), so we map best effort.

            const trigger = stack.steps?.[0]?.trigger || "Existing Routine";
            const action = stack.steps?.[0]?.title || stack.name;
            const duration = stack.steps?.[0]?.minutes || 5;

            const createRes = await apiClient.habitStacks.create({
                trigger_habit: trigger,
                action_habit: action,
                action_duration_mins: duration,
                goal_id: undefined // optional
            });

            if (createRes && createRes.stack) {
                const newStack = createRes.stack;
                addStack(newStack as any);

                // B. Apply Placement (if selected)
                if (placementIdx !== undefined && placements[placementIdx]) {
                    const option = placements[placementIdx];
                    if (option.patch) {
                        // Inject stack_id into patch if needed, or rely on AI patch having correct structure
                        // The prompt asks AI to use 'create_event' with 'habit' type.
                        // We might need to link it to the stack_id.

                        const patch = option.patch;
                        // Augment ops with habit_stack_id
                        patch.ops = patch.ops.map((op: any) => {
                            if (op.op === 'create_event') {
                                return { ...op, payload: { ...op.payload, habit_stack_id: newStack.id } };
                            }
                            return op;
                        });

                        await apiClient.patch.apply(patch, 'habit_stack_placement');
                    }
                }

                setStep('success');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            }

        } catch (error) {
            console.error("Save failed:", error);
            showToast("Failed to save habit stack", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <GlassCard className="w-full max-w-lg min-h-[400px] flex flex-col" padding="lg">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Layers className="w-5 h-5 text-[var(--color-primary)]" />
                        Stack Designer
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 flex flex-col">
                    <AnimatePresence mode="wait">

                        {/* STEP 1: INPUT */}
                        {step === 'input' && (
                            <motion.div
                                key="input"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 flex flex-col space-y-6"
                            >
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold">What habit do you want to build?</h3>
                                    <p className="text-sm text-[var(--text-tertiary)]">
                                        I'll design a tiny version and link it to your existing routine.
                                    </p>
                                </div>

                                <GlassInput
                                    placeholder="e.g. Read 5 pages daily, Floss teeth, Meditate..."
                                    value={habitIdea}
                                    onChange={(e) => setHabitIdea(e.target.value)}
                                    autoFocus
                                    className="text-lg p-4"
                                />

                                <div className="flex-1" />

                                <GlassButton
                                    variant="primary"
                                    size="lg"
                                    onClick={handleGenerate}
                                    disabled={!habitIdea.trim()}
                                    className="w-full"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Design My Stack
                                </GlassButton>
                            </motion.div>
                        )}

                        {/* STEP 2: LOADING */}
                        {step === 'processing' && (
                            <motion.div
                                key="processing"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex-1 flex flex-col items-center justify-center text-center space-y-6"
                            >
                                <div className="w-16 h-16 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                                <div>
                                    <h3 className="text-lg font-medium">Architecting Routine...</h3>
                                    <p className="text-sm text-[var(--text-tertiary)]">Finding the perfect anchor point.</p>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 3: REVIEW */}
                        {step === 'review' && (
                            <motion.div
                                key="review"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 flex flex-col space-y-6"
                            >
                                {/* The Stack Visualization */}
                                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-6 relative">
                                    <div className="absolute -top-3 left-6 px-2 bg-black text-[10px] uppercase font-bold text-[var(--color-primary)] tracking-wider">
                                        Tiny Habit Recipe
                                    </div>

                                    <div className="flex flex-col items-center gap-4 text-center">
                                        <div>
                                            <p className="text-xs uppercase text-[var(--text-tertiary)] mb-1">After I...</p>
                                            <p className="text-lg font-bold">{generatedStacks[selectedStackIdx]?.steps?.[0]?.trigger || "Wake Up"}</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] rotate-90" />
                                        <div>
                                            <p className="text-xs uppercase text-[var(--text-tertiary)] mb-1">I will...</p>
                                            <p className="text-lg font-bold text-[var(--color-primary)]">
                                                {generatedStacks[selectedStackIdx]?.steps?.[0]?.title || generatedStacks[selectedStackIdx]?.name}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-[var(--glass-border)] flex justify-between items-center text-sm text-[var(--text-secondary)]">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-4 h-4" />
                                            {generatedStacks[selectedStackIdx]?.steps?.[0]?.minutes || 5} min
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Layers className="w-4 h-4" />
                                            High Consistency
                                        </div>
                                    </div>
                                </div>

                                {/* Placements */}
                                <div className="space-y-3">
                                    <p className="text-xs uppercase font-bold text-[var(--text-tertiary)]">Schedule It (Optional)</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {placements.map((opt, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleSave(idx)}
                                                disabled={isLoading}
                                                className="flex items-center justify-between p-3 rounded-lg border border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:border-[var(--color-primary)]/50 transition-all text-left group"
                                            >
                                                <div>
                                                    <span className="font-bold text-sm block">{opt.label}</span>
                                                    <span className="text-xs text-[var(--text-tertiary)]">Add to calendar</span>
                                                </div>
                                                <ArrowRight className="w-4 h-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => handleSave(undefined)}
                                            disabled={isLoading}
                                            className="text-center text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] py-2"
                                        >
                                            Save to library only (Don't schedule)
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 4: SUCCESS */}
                        {step === 'success' && (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex-1 flex flex-col items-center justify-center text-center space-y-4"
                            >
                                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-8 h-8 text-green-500" />
                                </div>
                                <h3 className="text-xl font-bold">Stack Locked In!</h3>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </GlassCard>
        </div>
    );
}
