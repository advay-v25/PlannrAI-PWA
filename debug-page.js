const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    const response = await page.goto('http://localhost:3000/login');
    console.log('Status:', response.status());
    await page.waitForTimeout(2000);
    const bodyText = await page.evaluate(() => document.body.innerText);
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    console.log('Body Text:', bodyText.substring(0, 500));
    console.log('Body HTML:', bodyHTML.substring(0, 500));
    await browser.close();
  } catch (err) {
    console.log("Failed:", err);
  }
})();
