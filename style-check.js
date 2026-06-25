const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/login');
    await page.waitForTimeout(2000);
    const h1Style = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return null;
      const style = window.getComputedStyle(h1);
      return {
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        color: style.color,
        zIndex: style.zIndex,
        width: style.width,
        height: style.height,
        position: style.position
      };
    });
    console.log('H1 Style:', h1Style);
    const formContainerStyle = await page.evaluate(() => {
      const div = document.querySelector('.max-w-md');
      if (!div) return null;
      const style = window.getComputedStyle(div);
      return {
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility
      };
    });
    console.log('Form Container Style:', formContainerStyle);
    await browser.close();
  } catch (err) {
    console.log("Failed:", err);
  }
})();
