'use client';

import { AlertTriangle, Info, Check, Pencil, X } from 'lucide-react';
import { useCoach } from '@/hooks/use-coach';
import { ProposedOption } from '@/types/coach-v4';


interface ConfirmationModalProps {
    option: ProposedOption;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading: boolean;
}

export function ConfirmationModal({
    option,
    onConfirm,
    onCancel,
    isLoading,
}: ConfirmationModalProps) {
    // Accent-stripe treatment (matches the calendar week-view overhaul): a
    // full colored border+tint reads as loud, so color identity moves to a
    // left stripe + bevel while the fill/border stay neutral. Text keeps its
    // semantic color for scanability. No glow — this is a notice, not a hero
    // state.
    const severityColors = {
        info: 'text-[var(--color-primary)] shadow-[inset_3px_0_0_0_var(--color-primary),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_40%,_black)] dark:shadow-[inset_3px_0_0_0_var(--color-primary),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-primary)_40%,_black)]',
        caution: 'text-[var(--color-warning)] shadow-[inset_3px_0_0_0_var(--color-warning),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-warning)_40%,_black)] dark:shadow-[inset_3px_0_0_0_var(--color-warning),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-warning)_40%,_black)]',
        warning: 'text-[var(--color-error)] shadow-[inset_3px_0_0_0_var(--color-error),inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-error)_40%,_black)] dark:shadow-[inset_3px_0_0_0_var(--color-error),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-1px_0_0_color-mix(in_oklab,_var(--color-error)_40%,_black)]',
    };

    return (
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--glass-border)] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--glass-border)]">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Confirm Changes
                </h3>
            </div>

            {/* Content */}
            <div className="px-6 py-4 space-y-4">
                {/* Option Summary */}
                <div>
                    <h4 className="font-medium text-[var(--text-primary)]">{option.title}</h4>
                    {option.description && (
                        <p className="text-sm text-[var(--text-secondary)] mt-1">{option.description}</p>
                    )}
                </div>

                {option.tradeoff && (
                    <div className={`p-4 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-start gap-3 ${severityColors[(option.tradeoff.severity as 'info' | 'caution' | 'warning') || 'info']}`}>
                        <div className="shrink-0 mt-0.5">
                            {option.tradeoff.severity === 'warning' ? <AlertTriangle className="w-4 h-4" aria-hidden="true" /> : <Info className="w-4 h-4" aria-hidden="true" />}
                        </div>
                        <div>
                            <p className="text-sm font-medium">Please note</p>
                            <p className="text-sm opacity-90 mt-1">{option.tradeoff.warning}</p>
                        </div>
                    </div>
                )}

                {/* Operations Preview */}
                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-4">
                    <h5 className="text-overline mb-3">
                        Changes to be made
                    </h5>
                    <div className="space-y-2">
                        {/* Summary of changes */}
                        <div className="text-sm flex flex-col gap-1">
                            {option.preview && option.preview.blocks_added > 0 && (
                                <span className="text-[var(--color-success)] flex items-center gap-1.5">
                                    <Check className="w-3.5 h-3.5" aria-hidden="true" /> {option.preview.blocks_added} block(s) added
                                </span>
                            )}
                            {option.preview && option.preview.blocks_modified > 0 && (
                                <span className="text-[var(--color-warning)] flex items-center gap-1.5">
                                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> {option.preview.blocks_modified} block(s) modified
                                </span>
                            )}
                            {option.preview && option.preview.blocks_removed > 0 && (
                                <span className="text-[var(--color-error)] flex items-center gap-1.5">
                                    <X className="w-3.5 h-3.5" aria-hidden="true" /> {option.preview.blocks_removed} block(s) removed
                                </span>
                            )}
                        </div>
                        {option.preview && option.preview.affected_dates.length > 0 && (
                            <p className="text-xs text-[var(--text-tertiary)] mt-2">
                                Affects: {option.preview.affected_dates.join(', ')}
                            </p>
                        )}
                    </div>

                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-[var(--color-bg-primary)]/50 border-t border-[var(--glass-border)] flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg shadow-[0_0_16px_var(--color-primary-glow)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all font-medium"
                    >
                        {isLoading ? 'Applying...' : 'Confirm & Apply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
