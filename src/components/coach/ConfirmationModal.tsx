'use client';

import { CoachOption } from '@/hooks/useCoach';

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
        info: 'border-blue-200 bg-blue-50',
        caution: 'border-yellow-200 bg-yellow-50',
        warning: 'border-red-200 bg-red-50',
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Confirm Changes
                    </h3>
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-4">
                    {/* Option Summary */}
                    <div>
                        <h4 className="font-medium text-gray-900">{option.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                    </div>

                    {/* Impact */}
                    <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm">
                            <span className="font-medium">Impact:</span> {option.impact}
                        </p>
                    </div>

                    {/* Tradeoff Warning */}
                    {option.tradeoff && (
                        <div className={`rounded-lg p-3 border ${severityColors[option.tradeoff.severity]}`}>
                            <p className="text-sm font-medium mb-1">Tradeoff:</p>
                            <p className="text-sm">{option.tradeoff.warning}</p>
                        </div>
                    )}

                    {/* Preview Summary */}
                    <div className="border rounded-lg p-3">
                        <p className="text-sm font-medium mb-2">Changes:</p>
                        <div className="flex space-x-4 text-sm">
                            {option.preview.blocks_added > 0 && (
                                <span className="text-green-600">
                                    ✓ {option.preview.blocks_added} block(s) added
                                </span>
                            )}
                            {option.preview.blocks_modified > 0 && (
                                <span className="text-yellow-600">
                                    ✎ {option.preview.blocks_modified} block(s) modified
                                </span>
                            )}
                            {option.preview.blocks_removed > 0 && (
                                <span className="text-red-600">
                                    ✕ {option.preview.blocks_removed} block(s) removed
                                </span>
                            )}
                        </div>
                        {option.preview.affected_dates.length > 0 && (
                            <p className="text-xs text-gray-500 mt-2">
                                Affects: {option.preview.affected_dates.join(', ')}
                            </p>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                    >
                        {isLoading ? 'Applying...' : 'Confirm & Apply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
