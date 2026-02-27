import { ScheduleBlock, SchedulePatch, ConflictResult, ValidationResult } from './types';
import { ConflictService } from './ConflictService';
import { ValidationService } from './ValidationService';
import { createClient } from '@/lib/supabase/server';

export class CalendarEngine {
    private userId: string;
    private conflictService: ConflictService;
    private validationService: ValidationService;

    constructor(userId: string) {
        this.userId = userId;
        this.conflictService = new ConflictService(userId);
        this.validationService = new ValidationService(userId);
    }

    /**
     * Get all blocks for a date range
     */
    async getBlocks(startDate: string, endDate: string): Promise<ScheduleBlock[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', this.userId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) throw new Error(`Failed to fetch blocks: ${error.message}`);
        return data || [];
    }

    /**
     * Add a new block with validation
     */
    async addBlock(block: Omit<ScheduleBlock, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<{
        success: boolean;
        block?: ScheduleBlock;
        conflict?: ConflictResult;
        validation?: ValidationResult;
    }> {
        // Validate block data
        const validation = this.validationService.validateBlock(block);
        if (!validation.valid) {
            return { success: false, validation };
        }

        // Check for conflicts
        const conflict = await this.conflictService.checkConflict(block);
        if (conflict.hasConflict) {
            return { success: false, conflict };
        }

        // Insert block
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('schedule_blocks')
            .insert({
                ...block,
                user_id: this.userId
            })
            .select()
            .single();

        if (error) throw new Error(`Failed to add block: ${error.message}`);

        return { success: true, block: data };
    }

    /**
     * Update an existing block
     */
    async updateBlock(blockId: string, updates: Partial<ScheduleBlock>): Promise<{
        success: boolean;
        block?: ScheduleBlock;
        conflict?: ConflictResult;
    }> {
        // Get existing block
        const existing = await this.getBlockById(blockId);
        if (!existing) {
            throw new Error(`Block ${blockId} not found`);
        }

        // Check if locked
        if (existing.is_locked) {
            return {
                success: false,
                conflict: {
                    hasConflict: true,
                    type: 'anchor',
                    message: 'This block is locked and cannot be modified',
                    conflictingBlocks: [existing]
                }
            };
        }

        // Check for conflicts if time is changing
        if (updates.start_time || updates.end_time || updates.date) {
            const newBlock = { ...existing, ...updates };
            const conflict = await this.conflictService.checkConflict(newBlock, blockId);
            if (conflict.hasConflict) {
                return { success: false, conflict };
            }
        }

        // Update block
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('schedule_blocks')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', blockId)
            .eq('user_id', this.userId)
            .select()
            .single();

        if (error) throw new Error(`Failed to update block: ${error.message}`);

        return { success: true, block: data };
    }

    /**
     * Delete a block
     */
    async deleteBlock(blockId: string): Promise<{ success: boolean; error?: string }> {
        const existing = await this.getBlockById(blockId);

        if (existing?.is_locked) {
            return { success: false, error: 'Cannot delete locked blocks' };
        }

        const supabase = await createClient();
        const { error } = await supabase
            .from('schedule_blocks')
            .delete()
            .eq('id', blockId)
            .eq('user_id', this.userId);

        if (error) throw new Error(`Failed to delete block: ${error.message}`);

        return { success: true };
    }

    /**
     * Apply a schedule patch (atomic operation)
     */
    async applyPatch(patch: SchedulePatch): Promise<{
        success: boolean;
        version_id?: string;
        applied: {
            added: number;
            updated: number;
            removed: number;
        };
        errors?: string[];
    }> {
        // Create snapshot for undo
        const snapshot = await this.createSnapshot();

        const errors: string[] = [];
        let added = 0, updated = 0, removed = 0;

        try {
            // Process removals first
            for (const blockId of patch.remove || []) {
                const result = await this.deleteBlock(blockId);
                if (result.success) {
                    removed++;
                } else {
                    errors.push(`Failed to remove ${blockId}: ${result.error}`);
                }
            }

            // Process updates
            for (const update of patch.update || []) {
                const result = await this.updateBlock(update.block_id, update.changes);
                if (result.success) {
                    updated++;
                } else {
                    errors.push(`Failed to update ${update.block_id}: ${result.conflict?.message || 'Unknown error'}`);
                }
            }

            // Process additions
            for (const block of patch.add || []) {
                const result = await this.addBlock(block);
                if (result.success) {
                    added++;
                } else {
                    errors.push(`Failed to add block: ${result.validation?.errors?.join(', ') || result.conflict?.message}`);
                }
            }

            // If any critical errors, rollback
            if (errors.length > 0 && (added + updated + removed === 0)) {
                await this.rollbackToSnapshot(snapshot.id);
                return {
                    success: false,
                    version_id: snapshot.id,
                    applied: { added: 0, updated: 0, removed: 0 },
                    errors
                };
            }

            return {
                success: true,
                version_id: snapshot.id,
                applied: { added, updated, removed },
                errors: errors.length > 0 ? errors : undefined
            };
        } catch (error) {
            // Critical failure - rollback
            await this.rollbackToSnapshot(snapshot.id);
            throw error;
        }
    }

    /**
     * Create a snapshot for undo
     */
    private async createSnapshot(): Promise<{ id: string }> {
        const blocks = await this.getBlocks(
            new Date().toISOString().split('T')[0],
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        );

        const supabase = await createClient();
        const { data, error } = await supabase
            .from('schedule_versions')
            .insert({
                user_id: this.userId,
                snapshot: blocks,
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (error) throw new Error(`Failed to create snapshot: ${error.message}`);
        return data;
    }

    /**
     * Rollback to a previous snapshot
     */
    async rollbackToSnapshot(versionId: string): Promise<boolean> {
        const supabase = await createClient();
        const { data: version, error: fetchError } = await supabase
            .from('schedule_versions')
            .select('snapshot')
            .eq('id', versionId)
            .eq('user_id', this.userId)
            .single();

        if (fetchError) throw new Error(`Failed to fetch snapshot: ${fetchError.message}`);

        // Delete current blocks for the date range
        const dates = [...new Set((version.snapshot as ScheduleBlock[]).map(b => b.date))];

        if (dates.length > 0) {
            await supabase
                .from('schedule_blocks')
                .delete()
                .eq('user_id', this.userId)
                .in('date', dates);
        }

        // Restore from snapshot
        if ((version.snapshot as any[]).length > 0) {
            await supabase
                .from('schedule_blocks')
                .insert(version.snapshot);
        }

        return true;
    }

    /**
     * Get a single block by ID
     */
    private async getBlockById(blockId: string): Promise<ScheduleBlock | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('id', blockId)
            .eq('user_id', this.userId)
            .single();

        if (error) return null;
        return data;
    }
}
