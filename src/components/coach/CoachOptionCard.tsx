'use client';

import { useState } from 'react';
import { ProposedOption } from '@/types/coach-v4';
import { format, parseISO } from 'date-fns';

interface CoachOptionCardProps {
    option: ProposedOption;
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
    const [isExpanded, setIsExpanded] = useState(false);

    const severityColors = {
        info: 'bg-primary/5 text-primary/80 border-primary/10',
        caution: 'bg-yellow-500/5 text-yellow-500/80 border-yellow-500/10',
        warning: 'bg-red-500/5 text-red-500/80 border-red-500/10',
    };

    const confidenceColors = {
        high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        low: 'bg-red-500/10 text-red-400 border-red-500/20',
    };

    const confidenceLabels = {
        high: '🟢 High Confidence',
        medium: '🟡 Medium Confidence',
        low: '🔴 Low Confidence',
    };



    if (minimalMode) {
        return (
            <div
                className={`glass-card glass-interactive group p-3 transition-all w-full flex items-center justify-between gap-4 border-white/5 bg-white/5 ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                onClick={() => !disabled && onSelect()}
            >
                <div className="flex flex-col">
                    <h4 className="text-sm font-bold text-foreground leading-tight tracking-tight group-hover:text-orange-500 transition-colors">
                        {option.title}
                    </h4>
                    {option.impact && (
                        <div className="flex items-center space-x-2 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500/50"></div>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-orange-500/70">
                                {option.impact}
                            </span>
                        </div>
                    )}
                </div>
                <button
                    className="shrink-0 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/10 text-white/90 hover:bg-orange-500/20 hover:text-orange-500 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) onSelect();
                    }}
                    disabled={disabled}
                >
                    {disabled ? '...' : 'Apply'}
                </button>
            </div>
        );
    }

    return (
        <div
            className={`glass-card glass-interactive group p-5 transition-all w-full relative ${option.recommended
                    ? 'border-orange-500/40 bg-orange-500/5'
                    : 'border-white/5 bg-white/5'
                } ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
            onClick={() => !disabled && onSelect()}
        >
            {/* Recommendation Glow */}
            {option.recommended && (
                <div className="absolute inset-0 bg-orange-500/5 blur-xl -z-10 animate-pulse"></div>
            )}

            <div className="flex flex-col space-y-4">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-2">
                            {option.recommended && (
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">
                                    [ Recommended Action ]
                                </span>
                            )}
                            {option.confidence_score && (
                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm border ${confidenceColors[option.confidence_score]}`}>
                                    {confidenceLabels[option.confidence_score]}
                                </span>
                            )}
                        </div>
                        <h4 className="text-lg font-bold text-foreground leading-tight tracking-tight group-hover:text-orange-500 transition-colors">
                            {option.title}
                        </h4>
                    </div>
                </div>

                {/* Description */}
                <p className="text-sm text-foreground/80 leading-relaxed italic">
                    &quot;{option.description}&quot;
                </p>

                {/* Impact Highlight */}
                {option.impact && (
                    <div className="flex items-center space-x-2 py-2 border-y border-white/5">
                        <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]"></div>
                        <span className="text-xs font-bold uppercase tracking-widest text-orange-500/90">
                            {option.impact}
                        </span>
                    </div>
                )}



                {/* Action Button & See Why Row */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center space-x-2 ${option.recommended
                                ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:bg-orange-400'
                                : 'bg-white/15 text-white/90 hover:bg-white/25 hover:text-white'
                            }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!disabled) onSelect();
                        }}
                        disabled={disabled}
                    >
                        <span>{disabled ? 'Applying...' : 'Apply'}</span>
                    </button>

                    {option.scenario_analysis && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded);
                            }}
                            className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest bg-white/5 text-foreground/60 hover:bg-white/10 hover:text-foreground transition-colors"
                        >
                            {isExpanded ? 'Hide' : 'See Why'}
                        </button>
                    )}
                </div>

                {/* Scenario Analysis Toggle Content */}
                {option.scenario_analysis && isExpanded && (
                    <div className="mt-2 text-xs text-foreground/80 p-4 bg-white/[0.02] rounded-xl border border-white/5 leading-relaxed">
                        {option.scenario_analysis}
                    </div>
                )}

                {option.tradeoff && (
                    <div className={`text-xs p-3 rounded-xl border backdrop-blur-sm mt-2 ${severityColors[(option.tradeoff.severity as 'info' | 'caution' | 'warning')]}`}>
                        <span className="font-bold">NOTICE:</span> {option.tradeoff.warning}
                    </div>
                )}
            </div>
        </div>
    );
}
