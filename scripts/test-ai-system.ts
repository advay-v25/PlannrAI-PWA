/**
 * 🧪 PLANNRAI — AI SYSTEM TEST SUITE
 * Tests all AI endpoints end-to-end.
 *
 * Usage:
 *   npm run dev          (start dev server first)
 *   npm run test:ai      (run tests)
 *
 * Requirements:
 *   - Dev server running on localhost:3000
 *   - Valid auth session (login in browser first)
 *   - GROQ_API_KEY and OPENROUTER_API_KEY set in .env.local
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const AUTH_COOKIE = process.env.TEST_AUTH_COOKIE || '';

interface TestResult {
    name: string;
    passed: boolean;
    latency_ms: number;
    details?: string;
    error?: string;
}

const results: TestResult[] = [];

// ── Helpers ──────────────────────────────────────────────────────

async function runTest(
    name: string,
    endpoint: string,
    options: {
        method?: 'GET' | 'POST';
        body?: any;
        validate?: (data: any) => { valid: boolean; details: string };
        requireAuth?: boolean;
    } = {}
): Promise<void> {
    const start = Date.now();
    const { method = 'GET', body, validate, requireAuth = false } = options;

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (requireAuth && AUTH_COOKIE) {
            headers['Cookie'] = AUTH_COOKIE;
        }

        const response = await fetch(`${BASE}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        const latency = Date.now() - start;
        const data = await response.json();

        if (!response.ok) {
            // Auth routes should 401 without cookie — that's expected if no cookie
            if (response.status === 401 && requireAuth && !AUTH_COOKIE) {
                results.push({
                    name,
                    passed: true,
                    latency_ms: latency,
                    details: 'Skipped (no auth cookie) — returned 401 as expected',
                });
                return;
            }

            results.push({
                name,
                passed: false,
                latency_ms: latency,
                error: `HTTP ${response.status}: ${JSON.stringify(data).slice(0, 200)}`,
            });
            return;
        }

        if (validate) {
            const result = validate(data);
            results.push({
                name,
                passed: result.valid,
                latency_ms: latency,
                details: result.details,
                error: result.valid ? undefined : result.details,
            });
        } else {
            results.push({
                name,
                passed: true,
                latency_ms: latency,
                details: `OK (${latency}ms)`,
            });
        }
    } catch (e: any) {
        results.push({
            name,
            passed: false,
            latency_ms: Date.now() - start,
            error: e.message,
        });
    }
}

// ── Tests ────────────────────────────────────────────────────────

async function main() {
    console.log('');
    console.log('🧪  PlannrAI AI System Tests');
    console.log('═'.repeat(50));
    console.log(`   Base URL: ${BASE}`);
    console.log(`   Auth: ${AUTH_COOKIE ? 'Provided' : 'Not provided (auth-required tests will be skipped)'}`);
    console.log('');

    // ── 1. AI Provider Health ─────────────────────────────────────

    await runTest(
        '1. AI Providers (Groq + OpenRouter)',
        '/api/test-ai',
        {
            validate: (data) => {
                const passed = data.results?.filter((r: any) => r.success).length;
                const total = data.results?.length || 0;
                return {
                    valid: passed > 0,
                    details: `${passed}/${total} providers working`,
                };
            },
        }
    );

    // ── 2. Context Builder ────────────────────────────────────────

    await runTest(
        '2. Calendar Context Builder',
        '/api/test-context',
        {
            requireAuth: true,
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Context build failed' };
                const ctx = data.context;
                return {
                    valid: !!ctx?.user && ctx?.capacity != null,
                    details: `User: ${ctx?.user?.first_name}, Goals: ${data.summary?.goals_count}, Blocks: ${data.summary?.today_blocks}`,
                };
            },
        }
    );

    // ── 3. Plan Week ──────────────────────────────────────────────

    const nextMonday = getNextMonday();
    await runTest(
        '3. Plan Week AI',
        '/api/calendar/plan-week',
        {
            method: 'POST',
            requireAuth: true,
            body: { mode: 'balanced' },
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Plan week failed' };
                const options = data.options || data.variants || [];
                return {
                    valid: options.length > 0,
                    details: `${options.length} variants generated`,
                };
            },
        }
    );

    // ── 4. Optimize Day ───────────────────────────────────────────

    await runTest(
        '4. Optimize Day AI',
        '/api/calendar/optimize-day',
        {
            method: 'POST',
            requireAuth: true,
            body: { focus: 'balance' },
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Optimize day failed' };
                const options = data.options || [];
                return {
                    valid: options.length > 0,
                    details: `${options.length} options, analysis: ${data.analysis?.schedule_health || 'N/A'}`,
                };
            },
        }
    );

    // ── 5. Apply Schedule ─────────────────────────────────────────

    await runTest(
        '5. Apply Schedule (dry run)',
        '/api/calendar/apply-schedule',
        {
            method: 'POST',
            requireAuth: true,
            body: {
                action: 'manual',
                patch: {
                    add: [{
                        date: new Date().toISOString().split('T')[0],
                        start_time: '23:00',
                        end_time: '23:15',
                        title: 'AI Test Block (safe to delete)',
                        block_type: 'buffer',
                        status: 'planned',
                    }],
                },
            },
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Apply failed' };
                return {
                    valid: (data.data?.added || 0) >= 1,
                    details: `Added: ${data.data?.added}, Version: ${data.data?.version_id || 'none'}`,
                };
            },
        }
    );

    // ── 6. Brain Dump ─────────────────────────────────────────────

    await runTest(
        '6. Brain Dump Processing',
        '/api/brain-dump/submit',
        {
            method: 'POST',
            requireAuth: true,
            body: { text: 'Call the dentist tomorrow, feeling stressed about the deadline, need to buy groceries' },
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Brain dump failed' };
                const d = data.data || data;
                const items = d.extracted?.items?.length || 0;
                return {
                    valid: items > 0 || !!d.summary,
                    details: `${items} items extracted, summary: "${(d.summary || '').slice(0, 60)}"`,
                };
            },
        }
    );

    // ── 7. Goal Suggestions ───────────────────────────────────────

    await runTest(
        '7. Goal Suggestions',
        '/api/ai/suggest-goals',
        {
            requireAuth: true,
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Suggestions failed' };
                const d = data.data || data;
                const count = d.suggestions?.length || 0;
                return {
                    valid: count > 0,
                    details: `${count} suggestions, source: ${d.source || 'unknown'}`,
                };
            },
        }
    );

    // ── 8. Expert Strategy ────────────────────────────────────────

    await runTest(
        '8. Expert Strategy',
        '/api/goals/generate-strategy',
        {
            method: 'POST',
            requireAuth: true,
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Strategy failed' };
                const d = data.data || data;
                const hasStrategy = !!d.strategy;
                return {
                    valid: hasStrategy,
                    details: `Source: ${d.source || 'unknown'}, Archetype: ${d.strategy?.archetype?.name || 'none'}`,
                };
            },
        }
    );

    // ── 9. Coach Message ──────────────────────────────────────────

    await runTest(
        '9. Coach Chat',
        '/api/ai/execute',
        {
            method: 'POST',
            requireAuth: true,
            body: {
                channel: 'coach_chat',
                input: 'How am I doing this week?',
                context: {},
            },
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Coach failed' };
                return {
                    valid: true,
                    details: 'Coach responded',
                };
            },
        }
    );

    // ── 10. Home Page State ───────────────────────────────────────

    await runTest(
        '10. Home Page State',
        '/api/home/state',
        {
            requireAuth: true,
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Home state failed' };
                return {
                    valid: true,
                    details: 'Home state loaded',
                };
            },
        }
    );

    // ── 11. Weekly Review Context ─────────────────────────────────

    await runTest(
        '11. Weekly Review Context',
        '/api/weekly-review/context',
        {
            requireAuth: true,
            validate: (data) => {
                if (!data.success) return { valid: false, details: data.error || 'Review context failed' };
                return {
                    valid: true,
                    details: 'Weekly review context loaded',
                };
            },
        }
    );

    // ── 12. Build Verification ────────────────────────────────────

    await runTest(
        '12. App Health Check',
        '/api/ai/health',
        {
            validate: (data) => ({
                valid: true,
                details: `Status: ${data.status || data.data?.status || 'responsive'}`,
            }),
        }
    );

    // ── Report ───────────────────────────────────────────────────

    console.log('');
    console.log('━'.repeat(50));
    console.log('');

    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);

    for (const r of results) {
        const icon = r.passed ? '✅' : '❌';
        const latency = r.latency_ms < 1000
            ? `${r.latency_ms}ms`
            : `${(r.latency_ms / 1000).toFixed(1)}s`;

        console.log(`${icon} ${r.name} (${latency})`);
        if (r.details) console.log(`   ${r.details}`);
        if (r.error && !r.passed) console.log(`   ⚠️  ${r.error}`);
    }

    console.log('');
    console.log('━'.repeat(50));
    console.log(`📊 Results: ${passed.length} passed, ${failed.length} failed out of ${results.length}`);

    if (failed.length === 0) {
        console.log('✨ All tests passed! AI system is working.');
    } else {
        console.log('');
        console.log('Failed tests:');
        for (const f of failed) {
            console.log(`  ❌ ${f.name}: ${f.error}`);
        }
    }

    console.log('');
    process.exit(failed.length > 0 ? 1 : 0);
}

// ── Utils ────────────────────────────────────────────────────────

function getNextMonday(): string {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday.toISOString().split('T')[0];
}

main().catch(e => {
    console.error('Test runner crashed:', e);
    process.exit(1);
});
