import { motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';

interface OptionCardProps {
    id: string;
    title: string;
    impact: string;
    isApplying?: boolean;
}

export const OptionCard = ({ id, title, impact, isApplying }: OptionCardProps) => {
    const { applyOption } = useAgentStore();
    const { showToast } = useToast();

    const handleApply = async () => {
        // Log Acceptance Signal
        apiClient.post('/api/behavior/log', {
            type: 'acceptance',
            content: title,
            metadata: { option_id: id }
        }).catch(e => console.error("Failed to log signal", e));

        const result = await applyOption(id);

        if (result?.success) {
            showToast("Changes Applied", "success");
        } else {
            showToast("Failed to apply changes", "error");
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
                    <h4 className="text-sm font-medium text-white">{title}</h4>
                    <p className="text-xs text-white/50">{impact}</p>
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
                        <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
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
