
import { motion } from 'framer-motion';
import { formatDate } from '@/lib/utils';
import { EnergyGauge } from '@/components/ui/energy-gauge'; // Using existing

export function HomeHeader({ date, metrics, userState, insight }: any) {
    return (
        <header className="pt-8 px-6 pb-4 border-b border-[var(--glass-border)] bg-black/50 backdrop-blur-md sticky top-0 z-20">
            <div className="max-w-md mx-auto">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <p className="text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-tertiary)]">
                            {formatDate(new Date(date))}
                        </p>
                        <h1 className="text-xl font-bold mt-1 text-white">
                            Today
                        </h1>
                    </div>
                    <EnergyGauge level={userState?.energy_level || 3} size="sm" />
                </div>

                {/* Metrics Line */}
                <div className="flex items-center gap-3 text-xs font-mono text-[var(--color-text-secondary)] mt-2">
                    <span>Target: {metrics?.planned_min}m</span>
                    <span className="text-[var(--text-secondary)]">•</span>
                    <span className="text-[var(--color-primary)]">Done: {metrics?.completed_min}m</span>
                    <span className="text-[var(--text-secondary)]">•</span>
                    <span>Free: {metrics?.free_min}m</span>
                </div>

                {/* Insight */}
                {insight && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 text-sm text-[var(--color-text-secondary)] italic"
                    >
                        "{insight.text}"
                    </motion.div>
                )}
            </div>
        </header>
    );
}
