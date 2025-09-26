const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to Strategic Directives page
    await page.goto('http://localhost:3000/strategic-directives');

    // Wait for content to load
    await page.waitForSelector('h1', { timeout: 10000 });

    // Take screenshot
    await page.screenshot({
      path: 'sd-page-after-fix.png',
      fullPage: true
    });

    console.log('Screenshot saved as sd-page-after-fix.png');

    // Check SD-002 status
    const sd002Element = await page.locator('text="SD-002"').first();
    if (sd002Element) {
      const parent = await sd002Element.locator('..').locator('..');
      const buttonText = await parent.locator('button').allTextContents();
      console.log('SD-002 buttons found:', buttonText);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();