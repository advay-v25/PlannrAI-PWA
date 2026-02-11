import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
    process.stdout.write('Starting authentication setup...\n');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const testEmail = 'e2e-test@example.com';
    const testPassword = 'E2E-Test-Password-123!';

    process.stdout.write(`Ensuring user ${testEmail} exists...\n`);
    const { data: { users } } = await supabase.auth.admin.listUsers();
    let testUser = users?.find(u => u.email === testEmail);
    if (!testUser) {
        process.stdout.write('Creating new test user...\n');
        const { data: { user }, error } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true,
            user_metadata: { full_name: 'E2E Test User' }
        });
        if (error) throw error;
        testUser = user!;
    }

    process.stdout.write('Updating profile (onboarding_complete: true)...\n');
    const { error: profileError } = await supabase.from('profiles').update({
        onboarding_complete: true,
    }).eq('id', testUser.id);
    if (profileError) throw profileError;

    process.stdout.write('Signing in to get session...\n');
    const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
    });
    if (signInError) throw signInError;
    if (!session) throw new Error('No session');

    // Sync via in-page fetch
    process.stdout.write('Syncing session via browser fetch...\n');
    await page.goto('/login');
    const syncResult = await page.evaluate(async ({ session, secret }) => {
        const res = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session, secret })
        });
        return res.ok;
    }, { session, secret: 'e2e-debug-secret-99' });

    if (!syncResult) throw new Error('In-browser session sync failed');

    process.stdout.write('Navigating to /app...\n');
    await page.goto('/app');

    process.stdout.write('Waiting for /app URL...\n');
    await expect(page).toHaveURL(/.*\/app/, { timeout: 30000 });

    process.stdout.write('Saving storage state...\n');
    await page.context().storageState({ path: authFile });
    process.stdout.write('Setup complete.\n');
});
