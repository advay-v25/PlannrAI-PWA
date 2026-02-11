
import { createClient } from '@/lib/supabase/server';
import { CanonicalPatch, CanonicalPatchSchema } from '@/lib/ai/schemas';
import { ScheduleBlock } from '@/types/database';
import { SupabaseClient } from '@supabase/supabase-js';

export type PatchResult = {
    ok: boolean;
    request_id: string;
    version_id?: string;
    diff_summary?: { created: number; moved: number; updated: number; deleted: number };
    blocks?: ScheduleBlock[];
    error?: string;
    warnings?: string[];
};

export class PatchService {

    /**
     * Preview a patch without applying it.
     */
    static async preview(
        userId: string,
        patch: CanonicalPatch,
        range: { start: string; end: string },
        supabase: SupabaseClient
    ) {
        const requestId = crypto.randomUUID();

        // 1. Fetch Current State
        const { data: currentBlocks, error } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', range.start)
            .lte('date', range.end);

        if (error) throw new Error(`Failed to fetch blocks: ${error.message}`);

        // 2. Simulate Patch
        const beforeMap = new Map<string, ScheduleBlock>(currentBlocks.map(b => [b.id, b]));
        const afterMap = new Map<string, ScheduleBlock>(currentBlocks.map(b => [b.id, b]));

        const diff = { created: [] as any[], moved: [] as any[], updated: [] as any[], deleted: [] as any[] };
        const warnings: string[] = [];

        for (const change of patch.changes) {
            // Check Lock Violations
            if (change.op === 'MOVE' || change.op === 'UPDATE' || change.op === 'DELETE') {
                const block = beforeMap.get(change.block_id);
                if (!block) {
                    warnings.push(`Block ${change.block_id} not found.`);
                    continue; // Skip simulation for missing block
                }

                if (block.is_locked || block.commitment_id || block.block_type === 'meal' || block.block_type === 'sleep') {
                    throw new Error(`Cannot modify locked/anchor block: ${block.title} (${block.id})`);
                }
            }

            // Simulate
            if (change.op === 'CREATE') {
                const tempId = crypto.randomUUID();
                const newBlock = { ...change.block, id: tempId, user_id: userId };
                afterMap.set(tempId, newBlock as any);
                diff.created.push(newBlock);
            }
            else if (change.op === 'MOVE') {
                const block = afterMap.get(change.block_id);
                if (block) {
                    const original = beforeMap.get(block.id);
                    block.date = change.new_date;
                    block.start_time = change.new_start_time;
                    block.end_time = change.new_end_time;
                    diff.moved.push({ id: block.id, title: block.title, from: original, to: { ...block } });
                }
            }
            else if (change.op === 'UPDATE') {
                const block = afterMap.get(change.block_id);
                if (block) {
                    Object.assign(block, change.fields);
                    diff.updated.push({ id: block.id, fields: change.fields });
                }
            }
            else if (change.op === 'DELETE') {
                if (afterMap.has(change.block_id)) {
                    const block = afterMap.get(change.block_id);
                    afterMap.delete(change.block_id);
                    diff.deleted.push(block);
                }
            }
        }

        return {
            ok: true,
            request_id: requestId,
            preview: {
                before_blocks: Array.from(beforeMap.values()),
                after_blocks: Array.from(afterMap.values()),
                diff,
                warnings
            }
        };
    }

    /**
     * Apply a patch transactionally (best effort).
     */
    static async apply(
        userId: string,
        patch: CanonicalPatch,
        range: { start: string; end: string },
        supabaseClient?: SupabaseClient
    ): Promise<PatchResult> {
        const requestId = crypto.randomUUID();
        const supabase = supabaseClient || await createClient();

        // 1. Preview (Validation)
        let previewResult;
        try {
            previewResult = await this.preview(userId, patch, range, supabase);
        } catch (e: any) {
            return { ok: false, request_id: requestId, error: e.message };
        }

        // 2. Snapshot BEFORE
        const { data: beforeBlocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', range.start)
            .lte('date', range.end);

        // 3. Execution (Sequential)
        try {
            for (const change of patch.changes) {
                if (change.op === 'CREATE') {
                    const { error } = await supabase.from('schedule_blocks').insert({
                        ...change.block,
                        user_id: userId,
                        created_at: new Date().toISOString()
                    });
                    if (error) throw error;
                }
                else if (change.op === 'MOVE') {
                    const { error } = await supabase.from('schedule_blocks')
                        .update({
                            date: change.new_date,
                            start_time: change.new_start_time,
                            end_time: change.new_end_time
                        })
                        .eq('id', change.block_id)
                        .eq('user_id', userId);
                    if (error) throw error;
                }
                else if (change.op === 'UPDATE') {
                    const { error } = await supabase.from('schedule_blocks')
                        .update(change.fields)
                        .eq('id', change.block_id)
                        .eq('user_id', userId);
                    if (error) throw error;
                }
                else if (change.op === 'DELETE') {
                    const { error } = await supabase.from('schedule_blocks')
                        .delete()
                        .eq('id', change.block_id)
                        .eq('user_id', userId);
                    if (error) throw error;
                }
            }
        } catch (err: any) {
            console.error('Patch Execution Failed', err);
            return { ok: false, request_id: requestId, error: err.message };
        }

        // 4. Snapshot AFTER
        const { data: afterBlocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', range.start)
            .lte('date', range.end);

        // 5. Create Version
        const { data: version, error: verError } = await supabase
            .from('schedule_versions')
            .insert({
                user_id: userId,
                week_start: range.start,
                source: 'manual_patch',
                reason: patch.reason,
                snapshot_before: beforeBlocks,
                snapshot_after: afterBlocks,
                patch_json: patch,
                request_id: requestId,
                is_active: true
            })
            .select('id')
            .single();

        if (verError) {
            console.error('Version creation failed', verError);
        }

        return {
            ok: true,
            request_id: requestId,
            version_id: version?.id,
            diff_summary: {
                created: previewResult.preview.diff.created.length,
                moved: previewResult.preview.diff.moved.length,
                updated: previewResult.preview.diff.updated.length,
                deleted: previewResult.preview.diff.deleted.length
            },
            blocks: afterBlocks || []
        };
    }

    /**
     * Undo a specific version (restore snapshot_before).
     */
    static async undo(
        userId: string,
        versionId: string | undefined, // Valid ID or undefined for latest
        range: { start: string; end: string },
        supabaseClient?: SupabaseClient
    ) {
        const requestId = crypto.randomUUID();
        const supabase = supabaseClient || await createClient();

        // 1. Fetch Version
        let query = supabase.from('schedule_versions').select('*').eq('user_id', userId);

        if (versionId) {
            query = query.eq('id', versionId);
        } else {
            // Latest
            query = query
                .order('created_at', { ascending: false })
                .limit(1);
        }

        const { data: versions, error } = await query;
        const version = versions?.[0];

        if (error || !version) {
            throw new Error('Version not found for undo');
        }

        // 2. Restore Snapshot Before
        const snapshot = version.snapshot_before as ScheduleBlock[];
        if (!snapshot) {
            throw new Error('No snapshot_before found in version');
        }

        // 3. Apply Snapshot (Accurate Restore)
        const snapshotIds = new Set(snapshot.map(b => b.id));

        // 3.1 Fetch current blocks in range
        const { data: currentBlocks } = await supabase
            .from('schedule_blocks')
            .select('id')
            .eq('user_id', userId)
            .gte('date', range.start)
            .lte('date', range.end);

        // 3.2 Delete blocks not in snapshot
        if (currentBlocks && currentBlocks.length > 0) {
            const idsToDelete = currentBlocks
                .filter(b => !snapshotIds.has(b.id))
                .map(b => b.id);

            if (idsToDelete.length > 0) {
                await supabase.from('schedule_blocks')
                    .delete()
                    .in('id', idsToDelete);
            }
        }

        // 3.3 Upsert snapshot blocks
        if (snapshot.length > 0) {
            const { error: upsertError } = await supabase.from('schedule_blocks')
                .upsert(snapshot.map(b => ({
                    ...b,
                    updated_at: new Date().toISOString()
                })));

            if (upsertError) throw new Error(`Undo restore failed: ${upsertError.message}`);
        }

        // 4. Create Undo Entry
        await supabase.from('schedule_versions').insert({
            user_id: userId,
            week_start: range.start,
            source: 'undo',
            reason: `Undo version ${version.id}`,
            snapshot_before: [],
            snapshot_after: snapshot,
            request_id: requestId
        });

        return {
            ok: true,
            request_id: requestId,
            reverted_to_version_id: version.id,
            blocks: snapshot
        };
    }

    /**
     * Normalize older patch formats/AI formats to CanonicalPatch.
     */
    static normalize(patch: any): CanonicalPatch {
        // If already canonical, return
        const isCanonical = patch.changes && Array.isArray(patch.changes);
        if (isCanonical) return patch as CanonicalPatch;

        // Convert "ops" (CoachV4) to "changes"
        if (patch.ops && Array.isArray(patch.ops)) {
            const changes = patch.ops.map((op: any) => {
                const type = (op.op || '').toLowerCase();
                // "create" or "create_event" or "CREATE"
                if (type.includes('create')) {
                    const block = op.block || op.event || op.payload;
                    return {
                        op: 'CREATE',
                        block: block
                    };
                }
                if (type.includes('move')) {
                    const start = op.to_start || op.new_start_time;
                    const end = op.to_end || op.new_end_time;
                    const date = op.new_date || (start ? start.split('T')[0] : '');
                    return {
                        op: 'MOVE',
                        block_id: op.block_id || op.event_id,
                        new_date: date,
                        new_start_time: start,
                        new_end_time: end
                    };
                }
                if (type.includes('update')) {
                    return {
                        op: 'UPDATE',
                        block_id: op.block_id || op.event_id,
                        fields: op.fields || op.payload
                    };
                }
                if (type.includes('delete')) {
                    return {
                        op: 'DELETE',
                        block_id: op.block_id || op.event_id
                    };
                }
                return null;
            }).filter(Boolean);

            return {
                reason: patch.reason || 'Patch',
                changes: changes as any[]
            };
        }

        throw new Error('Unknown patch format: ' + JSON.stringify(patch));
    }
}
