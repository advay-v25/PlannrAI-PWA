'use client';

import { useCoach } from '@/hooks/use-coach';
import { CoachOption } from '@/types/coach-v4';


interface ConfirmationModalProps {
    option: CoachOption;
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
    const severityColors = {
        info: 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 text-[var(--color-primary)]',
        caution: 'border-[var(--color-warning)]/20 bg-[var(--color-warning)]/5 text-[var(--color-warning)]',
        warning: 'border-[var(--color-error)]/20 bg-[var(--color-error)]/5 text-[var(--color-error)]',
    };

    return (
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--glass-border)] rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
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

                {/* Tradeoff Warning */}
                {option.tradeoff && (
                    <div className={`p-4 rounded-lg border flex items-start gap-3 ${severityColors[option.tradeoff.severity || 'info']}`}>
                        <div className="shrink-0 mt-0.5">
                            {option.tradeoff.severity === 'warning' ? '⚠️' : 'ℹ️'}
                        </div>
                        <div>
                            <p className="text-sm font-medium">Please note</p>
                            <p className="text-sm opacity-90 mt-1">{option.tradeoff.warning}</p>
                        </div>
                    </div>
                )}

                {/* Operations Preview */}
                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg p-4">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                        Changes to be made
                    </h5>
                    <div className="space-y-2">
                        {/* Summary of changes */}
                        <div className="text-sm flex flex-col gap-1">
                            {option.preview && option.preview.blocks_added > 0 && (
                                <span className="text-[var(--color-success)]">
                                    ✓ {option.preview.blocks_added} block(s) added
                                </span>
                            )}
                            {option.preview && option.preview.blocks_modified > 0 && (
                                <span className="text-[var(--color-warning)]">
                                    ✎ {option.preview.blocks_modified} block(s) modified
                                </span>
                            )}
                            {option.preview && option.preview.blocks_removed > 0 && (
                                <span className="text-[var(--color-error)]">
                                    ✕ {option.preview.blocks_removed} block(s) removed
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
                        className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-all font-medium"
                    >
                        {isLoading ? 'Applying...' : 'Confirm & Apply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
