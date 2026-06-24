const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(3000);
  
  // Check placeholder color
  const placeholderColor = await page.evaluate(() => {
    const input = document.querySelector('input[type="email"]');
    if (!input) return 'no input found';
    const style = window.getComputedStyle(input, '::placeholder');
    return style.color;
  });
  console.log('Placeholder color:', placeholderColor);
  
  // Take screenshot
  await page.screenshot({ path: '/Users/advay/.gemini/antigravity-ide/brain/93c86c1b-f276-407e-b7d6-957c06f2e3eb/scratch/login_verify.png' });
  console.log('Screenshot saved');
  
  await browser.close();
})();
