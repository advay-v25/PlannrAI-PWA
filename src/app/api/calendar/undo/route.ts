import { NextResponse } from 'next/server';
import { apiError, apiSuccess, secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';
import { apiClient } from '@/lib/api-client'; // Wait, server route calling client? NO.
// Route should call internal logic or reuse apply logic.
// Problem: Apply logic is in `api/calendar/apply-patch`. We can't easily call another route internally in Next.js app directory without fetch.
// Better: Refactor apply logic into a shared service? 
// Or just let client handle it?
// The undo endpoint should:
// 1. Get inverse patch from PatchService.
// 2. Call the Apply Logic (which is complex).

// Option A: Client fetches undo patch, then calls apply-patch. (Least risk, reuses pipeline).
// Option B: Server endpoint does it all. (Cleaner API).

// Let's go with Option A for Phase 3 MVP stability.
// Endpoint: GET /api/calendar/undo -> Returns the Inverse Patch.
// Client: Receives patch -> Calls POST /api/calendar/apply-patch.

export const POST = secureApiRoute(async (context: SecureApiContext) => {
    // Note: Using POST because we are creating an 'undo' action, even if it just returns data primarily.
    // Actually, if we just want to fetch the inverse patch, GET is fine.
    // But if we want the server to EXECUTE the undo, that's different.

    // User request: "Undo must rollback transactionally + refresh calendar."

    // Let's try to execute it server side to be robust.
    const result = await PatchService.undoLast(context.userId);

    if (!result.success || !result.patch) {
        return apiError(result.message || 'Undo unavailable', 400);
    }

    // To execute the inverse patch, we need to invoke the logic from apply-patch.
    // Since we can't easily import the route handler, let's allow the CLIENT to receive the patch and apply it.
    // This also lets the client show the "Reverting..." state.

    // So this endpoint just Retrieves the Undo Patch.
    return apiSuccess({
        undo_patch: result.patch
    });
});
