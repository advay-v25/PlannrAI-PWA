export function applyPatchToBlocks(blocks: any[], ops: any[]) {
    let previewBlocks = [...blocks];
    for (const op of ops) {
        if (op.op === 'create_event' || op.op === 'create') {
            const newBlock = { ...op.payload, id: `preview-new-${Math.random().toString(36).substr(2, 9)}`, is_preview: true };
            previewBlocks.push(newBlock);
        } else if (op.op === 'delete_event' || op.op === 'delete') {
            previewBlocks = previewBlocks.filter(b => b.id !== op.event_id);
        } else if (op.op === 'update_event' || op.op === 'update' || op.op === 'move_block') {
            const targetId = op.event_id || op.payload?.id;
            const idx = previewBlocks.findIndex(b => b.id === targetId);
            if (idx >= 0) {
                previewBlocks[idx] = { ...previewBlocks[idx], ...op.payload, is_preview_updated: true };
            }
        }
    }
    return previewBlocks;
}
