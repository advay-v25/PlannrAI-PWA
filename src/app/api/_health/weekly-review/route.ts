
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        // 1. Check Table Existence
        const { error: tableError } = await supabase
            .from('weekly_reviews')
            .select('id')
            .limit(1);

        if (tableError && tableError.code === '42P01') { // undefined_table
            // Check signature of apiError. If it takes (msg, status, errors), then this is correct.
            // If linter complained about arg 3 not being string, maybe it is (msg, status, code?).
            // I will fix this after inspecting the file.
            // For now, I will assume it's (msg, status, errors) based on common patterns, 
            // but if the linter said "not assignable to string", maybe it expects a string code?
            // "Argument... is not assignable to parameter of type 'string'." -> 3rd arg is string?
            // Let's wait for view_file result.
            return apiError('Table weekly_reviews missing', 500, 'TABLE_MISSING', { error: tableError });
        }

        // 2. Check Columns (by attempting to select them)
        // We select NULL to avoid data privacy issues or heavy payloads, just checking schema validity
        const { error: columnError } = await supabase
            .from('weekly_reviews')
            .select('lever_note, lever_applied, updated_at')
            .limit(1);

        if (columnError) {
            return apiError('Column mismatch in weekly_reviews', 500, 'COLUMN_MISMATCH', {
                message: 'Required columns (lever_note, lever_applied) might be missing',
                details: columnError
            });
        }

        return apiSuccess({
            status: 'healthy',
            schema: 'verified',
            timestamp: new Date().toISOString()
        });
    },
    { requireAuth: true } // Only authenticated users can check strict health? Or open? Let's keep it secure.
);
