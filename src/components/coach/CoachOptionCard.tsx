'use client';

import { CoachOption } from '@/types/coach-v4';


interface CoachOptionCardProps {
    option: CoachOption;
    onSelect: () => void;
    disabled: boolean;
    minimalMode: boolean;
}

export function CoachOptionCard({
    option,
    onSelect,
    disabled,
    minimalMode
}: CoachOptionCardProps) {
    const severityColors = {
        info: 'bg-primary/5 text-primary/80 border-primary/10',
        caution: 'bg-yellow-500/5 text-yellow-500/80 border-yellow-500/10',
        warning: 'bg-red-500/5 text-red-500/80 border-red-500/10',
    };

    return (
        <div
            className={`glass-card glass-interactive group p-5 transition-all w-full relative ${option.recommended
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-white/5 bg-white/5'
                } ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
            onClick={() => !disabled && onSelect()}
        >
            {/* Recommendation Glow */}
            {option.recommended && (
                <div className="absolute inset-0 bg-primary/5 blur-xl -z-10 animate-pulse"></div>
            )}

            <div className="flex flex-col space-y-3">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                        {option.recommended && (
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                                [ Neural Recommendation ]
                            </span>
                        )}
                        <h4 className="text-sm font-bold text-foreground leading-tight tracking-tight group-hover:text-primary transition-colors">
                            {option.title}
                        </h4>
                    </div>
                </div>

                {/* Description */}
                <p className="text-xs text-foreground/60 leading-relaxed italic">
                    "{option.description}"
                </p>

                {/* Impact Highlight */}
                <div className="flex items-center space-x-2 py-2 border-y border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow"></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/90">
                        {option.impact}
                    </span>
                </div>

                {/* Detailed Plan Preview (The 'Plan View' for Big Edits) */}
                {option.patch?.ops && option.patch.ops.length > 0 && (
                    <div className="space-y-1.5 py-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/30">Proposed Protocol</span>
                        <div className="space-y-1">
                            {option.patch.ops.slice(0, 4).map((op, idx) => {
                                let label = '';
                                const type = op.op;
                                if (type.includes('create')) label = `Add: ${op.event?.title || op.title || 'New block'}`;
                                else if (type.includes('move')) label = `Move: ${op.title || 'Block'} to ${op.to_start}`;
                                else if (type.includes('delete')) label = `Cancel: ${op.title || 'Block'}`;
                                else if (type.includes('update')) label = `Update: ${op.title || 'Block'}`;
                                
                                return (
                                    <div key={idx} className="flex items-center space-x-2 text-[10px] text-foreground/70">
                                        <span className="text-primary/60">•</span>
                                        <span className="line-clamp-1">{label}</span>
                                    </div>
                                );
                            })}
                            {option.patch.ops.length > 4 && (
                                <div className="text-[9px] text-foreground/40 pl-3">
                                    + {option.patch.ops.length - 4} more operations
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Tradeoff Warning */}
                {option.tradeoff && (
                    <div className={`text-[10px] p-2 rounded-lg border backdrop-blur-sm ${severityColors[option.tradeoff.severity]}`}>
                        <span className="font-bold">NOTICE:</span> {option.tradeoff.warning}
                    </div>
                )}

                {/* Stats */}
                {!minimalMode && option.preview && (
                    <div className="flex space-x-4 opacity-50 group-hover:opacity-100 transition-opacity">
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-tighter text-foreground/40 font-bold">Scope</span>
                            <span className="text-[10px] text-foreground font-medium">
                                {option.preview.affected_dates.length} Day{option.preview.affected_dates.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-tighter text-foreground/40 font-bold">Ops</span>
                            <span className="text-[10px] text-foreground font-medium">
                                {option.preview.blocks_added + option.preview.blocks_modified + option.preview.blocks_removed} Changes
                            </span>
                        </div>
                    </div>
                )}

                {/* Action Button */}
                <button
                    className={`nav-link w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center space-x-2 ${option.recommended
                            ? 'bg-primary text-white shadow-glow'
                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) onSelect();
                    }}
                    disabled={disabled}
                >
                    <span>{disabled ? 'Applying Neural Protocol...' : option.tradeoff ? 'Review & Execute' : 'Execute Directive'}</span>
                </button>
            </div>
        </div>
    );
}
