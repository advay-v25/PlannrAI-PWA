
'use client';

import { useOnboardingStore } from '@/stores';
import { GlassToggle } from '@/components/ui/glass-toggle';
import { Network, Zap, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

export function Step5Permissions() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="h-full flex flex-col justify-center space-y-12">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-display font-light">Neural Link</h2>
                <p className="text-[var(--text-secondary)] font-light">
                    Define the autonomy protocols for your AI companion.
                </p>
            </div>

            <div className="space-y-6">

                <PermissionCard
                    icon={<Zap className="w-5 h-5 text-amber-400" />}
                    title="Proactive Suggestions"
                    description="Allow the system to offer strategy adjustments when obstacles are detected."
                    checked={data.ai_can_suggest}
                    onChange={(c: boolean) => updateData({ ai_can_suggest: c })}
                    delay={0.1}
                />

                <PermissionCard
                    icon={<Network className="w-5 h-5 text-orange-400" />}
                    title="Pattern Recognition"
                    description="Enable analysis of behavioral data to identify optimal working rhythms."
                    checked={data.ai_can_analyze}
                    onChange={(c: boolean) => updateData({ ai_can_analyze: c })}
                    delay={0.2}
                />

                <PermissionCard
                    icon={<FileText className="w-5 h-5 text-emerald-400" />}
                    title="Drafting Protocols"
                    description="Permit the system to prepare schedule drafts for your review."
                    checked={data.ai_can_draft}
                    onChange={(c: boolean) => updateData({ ai_can_draft: c })}
                    delay={0.3}
                />

            </div>
        </div>
    );
}

function PermissionCard({ icon, title, description, checked, onChange, delay }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay }}
            className={`
                p-5 rounded-2xl border transition-all duration-300
                ${checked
                    ? 'bg-[var(--glass-bg)] border-[var(--color-primary)]/50 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.1)]'
                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-70'
                }
            `}
        >
            <div className="flex items-start gap-4">
                <div className={`p-2 rounded-xl ${checked ? 'bg-[var(--color-primary)]/20' : 'bg-white/5'}`}>
                    {icon}
                </div>
                <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium text-white">{title}</h3>
                        <GlassToggle checked={checked} onChange={onChange} />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
