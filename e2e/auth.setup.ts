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

    process.stdout.write('Logging in via UI...\n');
    await page.goto('/login');
    
    // Switch to login tab if needed (assuming there's a login/signup toggle)
    // Wait for the email input
    await page.waitForSelector('input[type="email"]');
    
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    process.stdout.write('Waiting for /app URL...\n');
    await expect(page).toHaveURL(/.*\/app/, { timeout: 30000 });

    process.stdout.write('Saving storage state...\n');
    await page.context().storageState({ path: authFile });
    process.stdout.write('Setup complete.\n');
});
