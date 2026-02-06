
export async function testUndo() {
    console.log("🧪 Testing Undo API...");

    // Check if route exports exist
    // Check if route exports exist
    const undoRoute = await import('@/app/api/patch/undo/route');
    if (typeof undoRoute.POST === 'function') {
        console.log("   ✅ Undo Route exports POST.");
    }

    // Since we depend on `undoLast` finding a `patch_run`, this requires active DB state.
    // In this verification script, we just ensure the plumbing connects.

    console.log("   Manual Step: Perform an action (Coach/Patch), then trigger /api/patch/undo and verify calendar reverts.");
}

testUndo();
