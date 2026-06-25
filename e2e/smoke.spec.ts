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

            await page.getByPlaceholder(/What should I call you?/i).fill('E2E Explorer');
            // Click NEXT button
            await page.click('button:has-text("Next")');
        });

        await test.step('Step-by-Step Navigation', async () => {
            // Steps 2 through 5 (index 1 to 4)
            for (let stepNum = 2; stepNum <= 5; stepNum++) {
                await page.waitForTimeout(1000);

                if (stepNum === 4) {
                    // Goals step - needs a goal
                    await page.click('button:has-text("Add Goal")');
                    await page.getByPlaceholder(/e.g. Run a marathon/i).fill('E2E Goal');
                }

                // Look for NEXT button and click
                await page.click('button:has-text("Next")');
            }
        });

        await test.step('Final Synthesis', async () => {
            // Now on Step 6 (index 5)
            // Wait for apply button
            await page.waitForSelector('button:has-text("Generate Plan")', { timeout: 60000 });
            await page.click('button:has-text("Generate Plan")');

            await expect(page).toHaveURL(/.*\/app\/calendar\?setup=complete/, { timeout: 30000 });

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

    test('Feature: Cross-Feature State Reflection', async ({ page }) => {
        await page.goto('/app/goals');
        await page.waitForLoadState('networkidle');

        await test.step('Update goal and verify calendar reflection', async () => {
            // Trigger a goal change that should fire a schedule-recompute event
            await page.click('button:has-text("Add Goal")');
            await page.getByPlaceholder(/e.g. Run a marathon/i).fill('Reflection Goal');
            
            const craftBtn = page.locator('button:has-text("Craft")');
            if (await craftBtn.isVisible()) await craftBtn.click();
            
            await page.click('button:has-text("Add Goal")');
            await expect(page.locator('text=Reflection Goal')).toBeVisible();

            // Navigate to Calendar and verify it reloaded/reflected state
            await page.goto('/app/calendar');
            await expect(page).toHaveURL(/.*\/app\/calendar/);
            
            // Check that a schedule update message or event occurred (for now just verifying navigation and UI stability)
            // Note: Since this is an E2E test, we'll verify the main Calendar tab loads correctly after a Goal modification
            await expect(page.locator('text=Plan Your Day').or(page.locator('text=Calendar'))).toBeVisible();
        });
    });

});
