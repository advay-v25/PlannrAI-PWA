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
        info: 'bg-blue-50 text-blue-700 border-blue-200',
        caution: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        warning: 'bg-red-50 text-red-700 border-red-200',
    };

    return (
        <div
            className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${option.recommended
                    ? 'border-blue-300 bg-blue-50/50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onSelect()}
        >
            {/* Title Row */}
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center">
                    {option.recommended && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded mr-2">
                            Recommended
                        </span>
                    )}
                    <h4 className="font-medium text-gray-900">{option.title}</h4>
                </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 mb-2">{option.description}</p>

            {/* Impact */}
            <p className="text-sm text-gray-500 mb-2">
                <span className="font-medium">Impact:</span> {option.impact}
            </p>

            {/* Tradeoff Warning */}
            {option.tradeoff && (
                <div className={`text-sm p-2 rounded border ${severityColors[option.tradeoff.severity]}`}>
                    ⚠️ {option.tradeoff.warning}
                </div>
            )}

            {/* Preview Stats (compact in minimal mode) */}
            {!minimalMode && option.preview && (
                <div className="mt-3 flex space-x-4 text-xs text-gray-500">
                    {option.preview.blocks_added > 0 && (
                        <span className="text-green-600">+{option.preview.blocks_added} added</span>
                    )}
                    {option.preview.blocks_modified > 0 && (
                        <span className="text-yellow-600">~{option.preview.blocks_modified} modified</span>
                    )}
                    {option.preview.blocks_removed > 0 && (
                        <span className="text-red-600">-{option.preview.blocks_removed} removed</span>
                    )}
                </div>
            )}


            {/* Apply Button */}
            <button
                className={`mt-3 w-full py-2 rounded text-sm font-medium transition-colors ${option.recommended
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!disabled) onSelect();
                }}
                disabled={disabled}
            >
                {disabled ? 'Applying...' : option.tradeoff ? 'Preview & Apply' : 'Apply'}
            </button>
        </div>
    );
}
