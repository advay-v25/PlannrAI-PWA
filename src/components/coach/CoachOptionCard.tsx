'use client';

import { CoachOption } from '@/types/coach-v4';


interface CoachOptionCardProps {
    option: CoachOption;
    onSelect: () => void;
    disabled: boolean;
    minimalMode: boolean;
}

function formatTime(time: string | undefined): string {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m}${ampm}`;
}

function formatOpLabel(op: any): { icon: string; label: string } {
    const type = op.op || op.type || '';

    if (type.includes('create_todo')) {
        return { icon: '☑', label: `Add task: "${op.payload?.title || op.title || 'Task'}"` };
    }
    if (type.includes('update_todo')) {
        const changes = op.fields || op.changes || {};
        if (changes.is_completed === true) {
            return { icon: '✓', label: `Complete: "${op.title || 'Task'}"` };
        }
        return { icon: '✎', label: `Update task: "${op.title || 'Task'}"` };
    }
    if (type.includes('delete_todo')) {
        return { icon: '✕', label: `Remove task: "${op.title || 'Task'}"` };
    }

    if (type.includes('create_goal')) {
        return { icon: '🎯', label: `Add goal: "${op.payload?.title || op.title || 'Goal'}"` };
    }
    if (type.includes('update_goal')) {
        return { icon: '✎', label: `Update goal: "${op.title || 'Goal'}"` };
    }
    if (type.includes('delete_goal')) {
        return { icon: '✕', label: `Remove goal: "${op.title || 'Goal'}"` };
    }

    if (type.includes('create')) {
        const event = op.event || op.payload || op.data || {};
        const title = event.title || op.title || 'New Block';
        const start = event.start_time || op.start_time;
        const end = event.end_time || op.end_time;
        const date = event.date || op.date;
        const timeRange = start && end ? ` → ${formatTime(start)}–${formatTime(end)}` : '';
        const dateStr = date ? ` (${date})` : '';
        return { icon: '+', label: `Add: "${title}"${timeRange}${dateStr}` };
    }
    if (type.includes('move')) {
        const title = op.title || 'Block';
        const start = op.to_start || op.new_start;
        const end = op.to_end || op.new_end;
        const timeRange = start && end ? ` → ${formatTime(start)}–${formatTime(end)}` : '';
        const dateStr = op.date || op.new_date ? ` (${op.date || op.new_date})` : '';
        return { icon: '↔', label: `Move: "${title}"${timeRange}${dateStr}` };
    }
    if (type.includes('delete')) {
        return { icon: '✕', label: `Remove: "${op.title || 'Block'}"` };
    }
    if (type.includes('update')) {
        return { icon: '✎', label: `Update: "${op.title || 'Block'}"` };
    }

    return { icon: '•', label: type || 'Operation' };
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

    // Read from both .ops (CalendarPatchOp format) and .operations (PatchOperation format)
    const patchOps = (option.patch as any)?.ops || [];
    const operations = (option.patch as any)?.operations || [];
    const displayOps = patchOps.length > 0 ? patchOps : operations;
    const hasOps = displayOps.length > 0;

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
                    &quot;{option.description}&quot;
                </p>

                {/* Impact Highlight */}
                <div className="flex items-center space-x-2 py-2 border-y border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow"></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/90">
                        {option.impact}
                    </span>
                </div>

                {/* Proposed Changes — Human-readable timeslot view */}
                {hasOps && (
                    <div className="space-y-1.5 py-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/30">Proposed Changes</span>
                        <div className="space-y-1">
                            {displayOps.slice(0, 5).map((op: any, idx: number) => {
                                const { icon, label } = formatOpLabel(op);
                                const iconColor = icon === '+' || icon === '☑'
                                    ? 'text-emerald-400'
                                    : icon === '✕'
                                        ? 'text-red-400'
                                        : icon === '↔' || icon === '✎'
                                            ? 'text-yellow-400'
                                            : 'text-primary/60';
                                return (
                                    <div key={idx} className="flex items-start space-x-2 text-[11px] text-foreground/70">
                                        <span className={`${iconColor} font-bold shrink-0 w-3`}>{icon}</span>
                                        <span className="line-clamp-2">{label}</span>
                                    </div>
                                );
                            })}
                            {displayOps.length > 5 && (
                                <div className="text-[9px] text-foreground/40 pl-5">
                                    + {displayOps.length - 5} more operations
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
                    <span>{disabled ? 'Applying...' : option.tradeoff ? 'Review & Execute' : 'Review & Execute'}</span>
                </button>
            </div>
        </div>
    );
}
