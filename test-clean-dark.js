import { chromium } from 'playwright';

async function testCleanDarkMode() {
  const browser = await chromium.launch({ headless: false }); // Show browser
  
  // Create incognito context - no cookies, no localStorage
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    storageState: undefined // No saved state
  });
  
  const page = await context.newPage();
  
  console.log('🧹 Testing with COMPLETELY CLEAN browser (incognito mode)...\n');
  
  // Clear any existing localStorage before navigating
  await page.addInitScript(() => {
    localStorage.clear();
  });
  
  await page.goto('http://localhost:3000', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  // Wait for React to render
  await page.waitForTimeout(2000);
  
  // Now click the toggle to enable dark mode manually
  console.log('🔘 Clicking toggle to enable dark mode...');
  const toggleButton = await page.$('button[title*="mode"], button[aria-label*="mode"]');
  if (toggleButton) {
    await toggleButton.click();
    await page.waitForTimeout(1000);
  }
  
  // Check state after clicking
  const isDarkAfterClick = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });
  
  const themeAfterClick = await page.evaluate(() => {
    return localStorage.getItem('theme');
  });
  
  const bgAfterClick = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  
  console.log('\n📊 After Toggle Click:');
  console.log(`  Dark class: ${isDarkAfterClick ? '✅ YES' : '❌ NO'}`);
  console.log(`  Theme: ${themeAfterClick}`);
  console.log(`  Background: ${bgAfterClick}`);
  
  if (isDarkAfterClick && bgAfterClick.includes('17, 24, 39')) {
    console.log('\n✅ Dark mode toggle is working correctly!');
  } else {
    console.log('\n❌ Dark mode toggle is NOT working');
  }
  
  // Take screenshot
  await page.screenshot({ 
    path: 'after-manual-toggle.png',
    fullPage: true 
  });
  console.log('📸 Screenshot saved: after-manual-toggle.png');
  
  console.log('\nKeeping browser open for 5 seconds...');
  await page.waitForTimeout(5000);
  
  await browser.close();
}

testCleanDarkMode().catch(console.error);