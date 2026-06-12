
import { Play, CheckSquare, SkipForward } from 'lucide-react';

export function NextUpCard({ nextBlock, onAction }: any) {
    if (!nextBlock) {
        return (
            <div className="h-32 flex items-center justify-center border border-dashed border-white/10 rounded-2xl text-white/30 text-sm">
                No blocks scheduled. You're free.
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-[var(--glass-surface)] to-[var(--glass-highlight)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-primary)]" />

            <div className="flex justify-between items-start mb-4">
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary)] mb-1 block">
                        {nextBlock.reason || 'UP NEXT'}
                    </span>
                    <h3 className="text-xl font-bold text-white leading-tight">
                        {nextBlock.title}
                    </h3>
                    <p className="text-sm text-white/50 font-mono mt-1">
                        {formatTimeString(nextBlock.start_time)} - {formatTimeString(nextBlock.end_time)}
                    </p>
                </div>
                {/* Pillar Icon or similar could go here */}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2 mt-6">
                <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors gap-1 group/btn">
                    <Play className="w-5 h-5 text-white group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[10px] uppercase font-bold text-white/50">Start</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors gap-1 group/btn">
                    <CheckSquare className="w-5 h-5 text-white group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[10px] uppercase font-bold text-white/50">Done</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors gap-1 group/btn">
                    <SkipForward className="w-5 h-5 text-white group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[10px] uppercase font-bold text-white/50">Skip</span>
                </button>
            </div>
        </div>
    );
}
