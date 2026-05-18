
import React, { useState, useCallback } from 'react';
import { PatchPreviewModal } from '@/components/calendar/patch-preview-modal';
import { useToast } from '@/components/ui/toast';

export function usePatchPipeline() {
    const [isOpen, setIsOpen] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [previewData, setPreviewData] = useState<any>(null);
    const [pendingPatch, setPendingPatch] = useState<any>(null);
    const [pendingRange, setPendingRange] = useState<any>(null);
    const { showSuccess, showError } = useToast();

    const applyPatch = useCallback(async (patch: any, range?: { start: string, end: string }) => {
        setIsPreviewing(true);
        setPendingPatch(patch);
        setPendingRange(range);

        try {
            const res = await fetch('/api/calendar/preview-patch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patch, range })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Preview failed');
            }

            const data = await res.json();

            if (data.success || data.ok) {
                setPreviewData(data.data || data);
                setIsOpen(true);
            } else {
                throw new Error(data.error || 'Preview failed');
            }

        } catch (err: any) {
            showError(`Failed to prepare changes: ${err.message}`);
        } finally {
            setIsPreviewing(false);
        }
    }, [showError]);

    const confirmApply = useCallback(async () => {
        if (!pendingPatch) return;
        setIsApplying(true);

        try {
            const res = await fetch('/api/patch/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patch: pendingPatch, range: pendingRange })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Apply failed');
            }

            const data = await res.json();
            const successData = data.data || data;

            if (data.success || data.ok) {
                setIsOpen(false);
                const versionId = successData.version_id;

                const summary = successData.diff_summary || {};
                const total = (summary.created || 0) + (summary.updated || 0) + (summary.moved || 0) + (summary.deleted || 0);

                showSuccess(`Schedule updated (${total} changes)`, async () => {
                    // Undo Action
                    try {
                        const undoRes = await fetch('/api/calendar/undo', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ version_id: versionId, range: pendingRange })
                        });
                        if (undoRes.ok) {
                            showSuccess('Undone successfully. Refreshing...');
                            window.location.reload();
                        } else {
                            showError('Undo failed');
                        }
                    } catch (e: any) {
                        showError('Undo failed: ' + e.message);
                    }
                });

            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            showError(`Failed to apply changes: ${err.message}`);
        } finally {
            setIsApplying(false);
        }
    }, [pendingPatch, pendingRange, showSuccess, showError]);

    const handleClose = () => setIsOpen(false);

    const PatchModal = (
        <PatchPreviewModal
            isOpen={isOpen}
            onClose={handleClose}
            onApply={confirmApply}
            isApplying={isApplying}
            previewData={previewData}
        />
    );

    return {
        applyPatch,
        PatchModal,
        isPreviewing,
        isApplying
    };
}
