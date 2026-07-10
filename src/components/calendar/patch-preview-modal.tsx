import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassCard } from '@/components/ui/glass-card';
import { AlertTriangle, ArrowRight, Check, Trash2, Plus, RefreshCw, X } from 'lucide-react';
import { format } from 'date-fns';

interface PatchPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: () => void;
    isApplying: boolean;
    previewData: {
        diff?: {
            created: any[];
            moved: any[];
            deleted: any[];
        };
        warnings?: string[];
        preview?: { // handle nested structure if it exists
            diff: {
                created: any[];
                moved: any[];
                deleted: any[];
            };
            warnings: string[];
        }
    };
}

export function PatchPreviewModal({ isOpen, onClose, onApply, isApplying, previewData }: PatchPreviewModalProps) {
    if (!previewData) return null;

    const dataSource = previewData.preview || previewData;
    const diff = dataSource.diff || { created: [], moved: [], deleted: [] };
    const warnings = dataSource.warnings || [];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-50 w-full max-w-lg"
                    >
                        <GlassCard padding="lg" variant="default" className="max-h-[85vh] flex flex-col shadow-2xl border-white/10">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-bold">Review Changes</h2>
                                    <p className="text-sm text-[var(--text-muted)]">
                                        Confirm the updates to your schedule.
                                    </p>
                                </div>
                                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-[var(--text-muted)]" />
                                </button>
                            </div>

                            {/* Content - Scrollable */}
                            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                                {/* Warnings */}
                                {warnings && warnings.length > 0 && (
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                            <span className="text-sm font-bold text-yellow-500">Heads Up</span>
                                        </div>
                                        <ul className="space-y-1">
                                            {warnings.map((w: string, i: number) => (
                                                <li key={i} className="text-xs text-yellow-200/80">• {w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Changes List */}
                                <div className="space-y-4">
                                    {/* Created */}
                                    {diff?.created?.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-green-400 flex items-center gap-2">
                                                <Plus className="w-3 h-3" /> Adding
                                            </h3>
                                            {diff.created.map((item: any, i: number) => (
                                                <div key={i} className="bg-green-500/5 border border-green-500/10 rounded-md p-3 flex justify-between items-center">
                                                    <div>
                                                        <p className="text-sm font-medium text-green-100">{item.title}</p>
                                                        <p className="text-xs text-green-500/70">
                                                            {item.start_time ? format(new Date(item.start_time.includes('T') ? item.start_time : `${item.date || '2024-01-01'}T${item.start_time}`), 'h:mm a') : 'TBD'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Moved/Updated */}
                                    {diff?.moved?.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                                                <RefreshCw className="w-3 h-3" /> Adjusting
                                            </h3>
                                            {diff.moved.map((item: any, i: number) => (
                                                <div key={i} className="bg-blue-500/5 border border-blue-500/10 rounded-md p-3">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <p className="text-sm font-medium text-blue-100">{item.title}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-blue-500/70">
                                                        <span>
                                                            {item.from?.start_time ? format(new Date(item.from.start_time.includes('T') ? item.from.start_time : `2024-01-01T${item.from.start_time}`), 'h:mm a') : 'Original'}
                                                        </span>
                                                        <ArrowRight className="w-3 h-3" />
                                                        <span className="font-bold">
                                                            {item.to?.start_time ? format(new Date(item.to.start_time.includes('T') ? item.to.start_time : `2024-01-01T${item.to.start_time}`), 'h:mm a') : 'New Time'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Deleted */}
                                    {diff?.deleted?.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
                                                <Trash2 className="w-3 h-3" /> Removing
                                            </h3>
                                            {diff.deleted.map((item: any, i: number) => (
                                                <div key={i} className="bg-red-500/5 border border-red-500/10 rounded-md p-3 flex justify-between items-center opacity-70">
                                                    <p className="text-sm font-medium text-red-200 line-through">{item.title || 'Block'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {(!diff || (diff.created.length === 0 && diff.moved.length === 0 && diff.deleted.length === 0)) && (
                                        <p className="text-center text-sm text-[var(--text-muted)] py-4">
                                            No explicit schedule changes. Just updating goals/settings.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="pt-6 mt-6 border-t border-white/5 flex gap-3">
                                <GlassButton variant="ghost" onClick={onClose} className="flex-1">
                                    Cancel
                                </GlassButton>
                                <GlassButton
                                    variant="primary"
                                    onClick={onApply}
                                    className="flex-[2] btn-glow"
                                    disabled={isApplying}
                                >
                                    {isApplying ? 'Applying...' : 'Confirm Changes'}
                                </GlassButton>
                            </div>
                        </GlassCard>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
