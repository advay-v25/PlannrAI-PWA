const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  try {
    await page.goto('http://localhost:3001/login');
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log("Could not connect to localhost:3001");
  }
  await browser.close();
})();
