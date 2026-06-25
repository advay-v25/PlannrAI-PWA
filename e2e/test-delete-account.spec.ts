import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const testEmail = 'delete-me-e2e@example.com';
const testPassword = 'Delete-Me-Password-123!';

test.describe('Account Deletion Flow', () => {
    test('User can successfully delete their account', async ({ page }) => {
        // 1. Create the user directly
        const { data: { users } } = await supabase.auth.admin.listUsers();
        let userToDelete = users.find(u => u.email === testEmail);
        
        if (userToDelete) {
            await supabase.auth.admin.deleteUser(userToDelete.id);
        }

        const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true,
            user_metadata: { full_name: 'Delete Me User' }
        });
        
        expect(createError).toBeNull();
        expect(user).toBeDefined();

        // 2. Log in via UI
        await page.goto('/login');
        await page.waitForSelector('input[type="email"]');
        await page.fill('input[type="email"]', testEmail);
        await page.fill('input[type="password"]', testPassword);
        await page.click('button[type="submit"]');

        await expect(page).toHaveURL(/.*\/app/, { timeout: 30000 });

        // 3. Trigger deletion API directly from the browser to utilize the session & CSRF cookie
        const deleteResponse = await page.evaluate(async () => {
            // First we need to extract the CSRF token
            const match = document.cookie.match(new RegExp('(^| )csrf_token=([^;]+)'));
            const csrfToken = match ? match[2] : null;

            const res = await fetch('/api/auth/delete-account', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken || ''
                },
                body: JSON.stringify({ confirm: 'delete' })
            });
            return { status: res.status, ok: res.ok };
        });

        expect(deleteResponse.ok).toBe(true);

        // 4. Verify user is actually deleted from Supabase
        const { data: { users: updatedUsers } } = await supabase.auth.admin.listUsers();
        const deletedUserCheck = updatedUsers.find(u => u.email === testEmail);
        expect(deletedUserCheck).toBeUndefined();
    });
});
