
import React, { useState, useCallback } from 'react';
import { PatchPreviewModal } from '@/components/calendar/patch-preview-modal';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';

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
            const res = await apiClient.post<any>('/api/calendar/preview-patch', { patch, range });

            if (res.success) {
                setPreviewData(res.data);
                setIsOpen(true);
            } else {
                throw new Error(res.error?.message || 'Preview failed');
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
            const res = await apiClient.post<any>('/api/patch/apply', { patch: pendingPatch, range: pendingRange });

            if (res.success) {
                setIsOpen(false);
                const versionId = res.data.version_id;

                const summary = res.data.diff_summary || {};
                const total = (summary.created || 0) + (summary.updated || 0) + (summary.moved || 0) + (summary.deleted || 0);

                showSuccess(`Schedule updated (${total} changes)`, async () => {
                    // Undo Action
                    try {
                        const undoRes = await apiClient.post<any>('/api/calendar/undo', { version_id: versionId, range: pendingRange });
                        if (undoRes.ok) {
                            showSuccess('Undone successfully. Refreshing...');
                            window.location.reload();
                        } else {
                            showError('Undo failed: ' + (undoRes.error?.message || 'Unknown error'));
                        }
                    } catch (e: any) {
                        showError('Undo failed: ' + e.message);
                    }
                });

            } else {
                throw new Error(res.error?.message || 'Apply failed');
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
