const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(1000);
  const html = await page.evaluate(() => document.body.outerHTML);
  console.log(html);
  await browser.close();
})();
