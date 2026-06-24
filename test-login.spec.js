const { test, expect } = require('@playwright/test');

test('debug login', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
    errors.push(err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  console.log('ERRORS:', errors);
});
