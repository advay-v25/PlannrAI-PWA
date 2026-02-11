
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowRight, Check, Trash2, Plus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface PatchPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: () => void;
    isApplying: boolean;
    previewData: any; // Type from API response
}

export function PatchPreviewModal({
    isOpen,
    onClose,
    onApply,
    isApplying,
    previewData
}: PatchPreviewModalProps) {
    if (!previewData) return null;

    const { diff, warnings } = previewData.preview;
    const hasWarnings = warnings && warnings.length > 0;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Review Schedule Changes</DialogTitle>
                    <DialogDescription>
                        Please verify the proposed changes to your schedule.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-4 py-4">
                        {/* Warnings */}
                        {hasWarnings && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 text-sm text-yellow-500">
                                <div className="flex items-center gap-2 font-medium mb-1">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>Warnings</span>
                                </div>
                                <ul className="list-disc list-inside space-y-1 opacity-90">
                                    {warnings.map((w: string, i: number) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Created */}
                        {diff.created.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-2">
                                    <Plus className="w-3 h-3" /> Adding ({diff.created.length})
                                </h4>
                                <div className="space-y-2">
                                    {diff.created.map((block: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-2 rounded-md bg-green-500/5 text-sm border border-green-500/10">
                                            <span className="font-medium">{block.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {format(new Date(`${block.date}T${block.start_time}`), 'EEE h:mma')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Moved */}
                        {diff.moved.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3" /> Moving ({diff.moved.length})
                                </h4>
                                <div className="space-y-2">
                                    {diff.moved.map((m: any, i: number) => (
                                        <div key={i} className="p-2 rounded-md bg-blue-500/5 text-sm border border-blue-500/10">
                                            <div className="font-medium mb-1">{m.title}</div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{format(new Date(`${m.from.date}T${m.from.start_time}`), 'EEE h:mma')}</span>
                                                <ArrowRight className="w-3 h-3" />
                                                <span className="text-blue-500">{format(new Date(`${m.to.date}T${m.to.start_time}`), 'EEE h:mma')}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Deleted */}
                        {diff.deleted.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-2">
                                    <Trash2 className="w-3 h-3" /> Removing ({diff.deleted.length})
                                </h4>
                                <div className="space-y-2">
                                    {diff.deleted.map((block: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-2 rounded-md bg-red-500/5 text-sm border border-red-500/10">
                                            <span className="font-medium decoration-line-through decoration-red-500/50">{block.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {format(new Date(`${block.date}T${block.start_time}`), 'EEE h:mma')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isApplying}>
                        Cancel
                    </Button>
                    <Button onClick={onApply} disabled={isApplying}>
                        {isApplying ? 'Applying...' : 'Apply Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
