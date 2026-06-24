const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/advay/.gemini/antigravity-ide/brain/93c86c1b-f276-407e-b7d6-957c06f2e3eb/scratch/screenshot.png' });
  await browser.close();
})();
