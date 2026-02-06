import { motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';

import type { Sacrifice } from '@/lib/agents/core/types';

interface OptionCardProps {
    id: string;
    label: string;
    description?: string;
    warnings?: string[];
    sacrifices?: Sacrifice[];
    isApplying?: boolean;
}

import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';

export const OptionCard = ({ id, label, description, warnings, sacrifices, isApplying }: OptionCardProps) => {
    const { applyOption } = useAgentStore();
    const { showToast } = useToast();

    const handleApply = async () => {
        const result = await applyOption(id);

        if (result?.success) {
            // Show Undo Toast
            if (result.undo_available && result.patch_run_id) {
                showToast(
                    "Changes Applied",
                    "success",
                    5000,
                    <button
                        onClick={() => handleUndo(result.patch_run_id)}
                        className="ml-2 px-3 py-1 text-xs font-bold text-white bg-white/20 rounded-md hover:bg-white/30 transition-colors"
                    >
                        UNDO
                    </button>
                );
            } else {
                showToast("Changes Applied", "success");
            }
        } else {
            showToast("Failed to apply changes", "error");
        }
    };

    const handleUndo = async (patchRunId: string) => {
        // Optimistic UI or wait?
        showToast("Undoing actions...", "info");

        try {
            // 1. Get Undo Patch
            const { undo_patch } = await apiClient.post<any>('/api/calendar/undo', {}); // Uses server logic to find last

            if (undo_patch) {
                // 2. Apply it
                await apiClient.post('/api/calendar/apply-patch', {
                    patch: undo_patch
                });

                // 3. Refresh
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
                showToast("Changes Reverted", "success");
            }
        } catch (e) {
            console.error(e);
            showToast("Undo failed", "error");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/5 p-4 transition-all hover:bg-white/10 hover:border-white/10"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                    <h4 className="text-sm font-medium text-white">{label}</h4>
                    {description && (
                        <p className="text-xs text-white/50">{description}</p>
                    )}

                    {/* Warnings */}
                    {(warnings?.length || 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {warnings?.map((w, i) => (
                                <span key={i} className="inline-flex items-center rounded-md bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-500 ring-1 ring-inset ring-yellow-500/20">
                                    {w}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Structured Sacrifices */}
                    {(sacrifices?.length || 0) > 0 && (
                        <div className="space-y-1 pt-1">
                            <p className="text-[10px] uppercase text-red-400/70 font-bold tracking-wider">Trade-offs Required</p>
                            <div className="flex flex-wrap gap-1">
                                {sacrifices?.map((s, i) => (
                                    <div key={i} className={cn(
                                        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium ring-1 ring-inset",
                                        s.effect === 'major'
                                            ? "bg-red-500/20 text-red-200 ring-red-500/40"
                                            : "bg-red-500/5 text-red-400 ring-red-500/20"
                                    )}>
                                        <X className="w-3 h-3" />
                                        <span>
                                            <span className="font-bold">{s.title}</span>
                                            <span className="opacity-70 mx-1">•</span>
                                            <span className="opacity-70">{s.description}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={handleApply}
                disabled={isApplying}
                className={cn(
                    "mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors",
                    isApplying
                        ? "cursor-wait bg-white/5 text-white/30"
                        : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                )}
            >
                {isApplying ? (
                    <span className="flex items-center gap-2">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            className="h-3 w-3 rounded-full border-2 border-current border-t-transparent"
                        />
                        Applying...
                    </span>
                ) : (
                    <>
                        Apply Change <ArrowRight className="h-3 w-3" />
                    </>
                )}
            </button>
        </motion.div>
    );
};
