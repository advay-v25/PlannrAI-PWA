import { motion } from 'framer-motion';
import { Zap, Activity, AlertTriangle, Smile, Frown, Meh } from 'lucide-react';

interface Signals {
    energy_delta?: number;
    sentiment?: number;
    overwhelm?: number;
}

export function SignalCard({ signals }: { signals: Signals }) {
    if (!signals || (signals.energy_delta === undefined && signals.sentiment === undefined && signals.overwhelm === undefined)) {
        return null;
    }

    const getSentimentIcon = (val: number) => {
        if (val >= 0.3) return <Smile className="w-4 h-4 text-green-400" />;
        if (val <= -0.3) return <Frown className="w-4 h-4 text-red-400" />;
        return <Meh className="w-4 h-4 text-yellow-400" />;
    };

    const getEnergyColor = (val: number) => {
        if (val > 0) return 'text-green-400';
        if (val < 0) return 'text-red-400';
        return 'text-[var(--text-secondary)]';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 mt-2 mb-1"
        >
            {signals.energy_delta !== undefined && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs font-medium ${getEnergyColor(signals.energy_delta)}`}>
                    <Zap className="w-3 h-3" />
                    <span>
                        {signals.energy_delta > 0 ? '+' : ''}{signals.energy_delta} Energy
                    </span>
                </div>
            )}

            {signals.sentiment !== undefined && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs font-medium text-[var(--text-secondary)]">
                    {getSentimentIcon(signals.sentiment)}
                    <span>Sentiment</span>
                </div>
            )}

            {signals.overwhelm !== undefined && signals.overwhelm > 0.5 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs font-medium text-orange-400">
                    <AlertTriangle className="w-3 h-3" />
                    <span>High Overwhelm</span>
                </div>
            )}
        </motion.div>
    );
}
