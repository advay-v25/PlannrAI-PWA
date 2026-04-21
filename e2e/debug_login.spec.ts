import { test, expect } from '@playwright/test';

test('debug login button click', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(`[Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PageError]: ${err.message}`));
  
  const requests: string[] = [];
  page.on('request', req => requests.push(`[Request] ${req.method()} ${req.url()}`));
  page.on('response', res => requests.push(`[Response] ${res.status()} ${res.url()}`));

  console.log('Navigating to login page...');
  await page.goto('http://localhost:3000/login');
  
  console.log('Waiting for network idle...');
  await page.waitForLoadState('networkidle');

  console.log('Clicking the Google sign-in button...');
  await page.getByRole('button', { name: /Continue with Google/i }).click();

  console.log('Waiting 5 seconds to see what happens...');
  await page.waitForTimeout(5000);

  console.log('Final URL:', page.url());
  
  console.log('--- LOGS ---');
  console.log(logs.join('\n'));
  console.log('--- REQUESTS ---');
  console.log(requests.join('\n'));
});
