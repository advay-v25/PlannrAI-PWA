import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Direct DB check helper
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const testEmail = 'e2e-test@example.com';

async function getUserId() {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === testEmail);
    return user?.id;
}

test.describe('E2E Regression Pack', () => {
    let userId: string;

    test.beforeAll(async () => {
        userId = (await getUserId())!;
        if (!userId) throw new Error('Test user not found');
    });

    test('Onboarding Flow and Dashboard Entry', async ({ page }) => {
        await test.step('Reset Onboarding State', async () => {
            await supabase.from('profiles').update({ onboarding_complete: false }).eq('id', userId);
        });

        await test.step('Start Onboarding', async () => {
            await page.goto('/onboarding');
            await expect(page).toHaveURL(/.*\/onboarding/);

            await page.getByPlaceholder(/Enter Designation/i).fill('E2E Explorer');
            // Click START button
            await page.click('button:has-text("START")');
            await expect(page.locator('text=Sequence 2/8')).toBeVisible({ timeout: 15000 });
        });

        await test.step('Step-by-Step Navigation', async () => {
            // Steps 2 through 7
            for (let stepNum = 2; stepNum <= 7; stepNum++) {
                // Small pause for stability
                await page.waitForTimeout(1000);

                // Look for NEXT button and click
                await page.click('button:has-text("NEXT")');

                // Wait for next sequence indicator
                if (stepNum < 7) {
                    await expect(page.locator(`text=Sequence ${stepNum + 1}/8`)).toBeVisible({ timeout: 15000 });
                }
            }
        });

        await test.step('Final Synthesis', async () => {
            // Now on Step 8 (Sequence 8/8)
            await expect(page.locator('text=Sequence 8/8')).toBeVisible();

            // Wait for synthesis button (it might be in "GENERATING..." state)
            await page.waitForSelector('button:has-text("APPLY SCHEDULE")', { timeout: 60000 });
            await page.click('button:has-text("APPLY SCHEDULE")');

            await expect(page).toHaveURL(/.*\/app/, { timeout: 30000 });

            const { data: profile } = await supabase.from('profiles').select('onboarding_complete').eq('id', userId).single();
            expect(profile?.onboarding_complete).toBe(true);
        });
    });

    test('Feature: Goal & Commitment Management', async ({ page }) => {
        await page.goto('/app/goals');
        await page.waitForLoadState('networkidle');

        await test.step('Create New Goal', async () => {
            await page.click('button:has-text("Add Goal")');
            await page.getByPlaceholder(/Learn Python, Morning Run/i).fill('E2E Regression Goal');

            const craftBtn = page.locator('button:has-text("Craft")');
            if (await craftBtn.isVisible()) await craftBtn.click();

            await page.click('button:has-text("Add Goal")');
            await expect(page.locator('text=E2E Regression Goal')).toBeVisible();
        });

        await test.step('Create Fixed Anchor', async () => {
            await page.click('button:has-text("Commitment")');
            await page.getByPlaceholder(/Work, School, Class/i).fill('E2E Fixed Anchor');
            await page.click('button:has-text("Save Commitment")');
            await expect(page.locator('text=E2E Fixed Anchor')).toBeVisible();
        });
    });

    test('Feature: AI Coach Interactions', async ({ page }) => {
        await page.goto('/app');
        await page.waitForLoadState('networkidle');

        await test.step('Ask AI Coach', async () => {
            await page.click('button:has-text("AI Coach")');
            const chatInput = page.getByPlaceholder(/Ask me anything/i);
            await chatInput.fill('Suggest a task for my Regression Goal');
            await chatInput.press('Enter');
            await page.waitForTimeout(3000);
        });
    });

    test('Feature: Intelligent Brain Dump', async ({ page }) => {
        await page.goto('/app/brain-dump');

        await test.step('Submit Low Energy Dump', async () => {
            const dumpInput = page.getByPlaceholder(/What's on your mind\?/i);
            await dumpInput.fill('I am completely exhausted today. Cannot do anything.');
            await page.click('button:has-text("Process")');

            await page.waitForSelector('button:has-text("Apply")', { timeout: 45000 });
            await page.click('button:has-text("Apply")');

            const { data: profile } = await supabase.from('profiles').select('low_energy_mode').eq('id', userId).single();
            expect(profile?.low_energy_mode).toBe(true);
        });
    });

});
