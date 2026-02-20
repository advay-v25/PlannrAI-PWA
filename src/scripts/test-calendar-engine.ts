import { CalendarEngine } from '../lib/calendar/calendar-engine';
import { PatchService, Patch } from '../lib/services/patch-service';

// Mock Supabase Client
const mockSupabase: any = {
    from: (table: string) => ({
        select: (cols: string) => ({
            eq: (col: string, val: any) => ({
                eq: (col2: string, val2: any) => ({
                    single: async () => {
                        if (table === 'schedule_blocks' && val2 === '2026-02-20') {
                            return { data: { id: val, date: '2026-02-20', start_time: '10:00', end_time: '11:00', is_fixed: true, title: 'Anchor' } };
                        }
                        return { data: null };
                    },
                    then: (resolve: any) => {
                        resolve({
                            data: [
                                { id: 'anchor-1', date: '2026-02-20', start_time: '10:00', end_time: '11:00', is_fixed: true, title: 'Morning Meeting' },
                                { id: 'flex-1', date: '2026-02-20', start_time: '13:00', end_time: '14:00', is_fixed: false, title: 'Deep Work' }
                            ]
                        });
                    }
                }),
                single: async () => {
                    return { data: { id: val, date: '2026-02-20', start_time: '10:00', end_time: '11:00', is_fixed: true, title: 'Morning Meeting' } };
                }
            })
        })
    })
};

async function runTests() {
    console.log("Running CalendarEngine Validation Tests...");

    const userId = "test-user-123";

    // Test 1: Valid Patch (No overlap)
    const validPatch: Patch = {
        ops: [
            { op: 'create_event', payload: { date: '2026-02-20', start_time: '11:30', end_time: '12:30', title: 'Lunch', block_type: 'meal' } }
        ]
    };
    const validResult = await CalendarEngine.validatePatch(userId, validPatch, mockSupabase);
    console.log(`Test 1 (Valid Patch): ${validResult.valid ? 'PASSED' : 'FAILED'}`, validResult.errors);

    // Test 2: Overlapping Patch
    const overlapPatch: Patch = {
        ops: [
            { op: 'create_event', payload: { date: '2026-02-20', start_time: '10:30', end_time: '11:30', title: 'Conflict', block_type: 'goal' } }
        ]
    };
    const overlapResult = await CalendarEngine.validatePatch(userId, overlapPatch, mockSupabase);
    console.log(`Test 2 (Overlap Patch): ${!overlapResult.valid && overlapResult.errors.length > 0 ? 'PASSED' : 'FAILED'}`, overlapResult.errors);

    // Test 3: Moving an Anchor
    const moveAnchorPatch: Patch = {
        ops: [
            { op: 'update_event', event_id: 'anchor-1', payload: { start_time: '09:00', end_time: '10:00', date: '2026-02-20' } }
        ]
    };
    const moveAnchorResult = await CalendarEngine.validatePatch(userId, moveAnchorPatch, mockSupabase);
    console.log(`Test 3 (Move Anchor Patch): ${!moveAnchorResult.valid && moveAnchorResult.errors.length > 0 ? 'PASSED' : 'FAILED'}`, moveAnchorResult.errors);

    // Test 4: Moving a flexible block successfully
    const moveFlexPatch: Patch = {
        ops: [
            { op: 'update_event', event_id: 'flex-1', payload: { start_time: '14:00', end_time: '15:00', date: '2026-02-20' } }
        ]
    };
    // Need to tweak mock to identify flex-1 as flexible
    const flexMock: any = {
        from: () => ({
            select: () => ({
                eq: (c: any, v: any) => ({
                    eq: () => ({
                        then: (cb: any) => cb({ data: [{ id: 'flex-1', date: '2026-02-20', start_time: '13:00', end_time: '14:00', is_fixed: false }] })
                    }),
                    single: async () => ({ data: { id: 'flex-1', date: '2026-02-20', start_time: '13:00', end_time: '14:00', is_fixed: false } })
                })
            })
        })
    };
    const moveFlexResult = await CalendarEngine.validatePatch(userId, moveFlexPatch, flexMock);
    console.log(`Test 4 (Move Flex Patch): ${moveFlexResult.valid ? 'PASSED' : 'FAILED'}`, moveFlexResult.errors);
}

runTests().catch(console.error);
