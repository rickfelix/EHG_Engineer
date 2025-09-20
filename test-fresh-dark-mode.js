import { chromium } from 'playwright';

async function testFreshDarkMode() {
  const browser = await chromium.launch({ headless: false }); // Show browser
  
  // Create completely fresh context (no cookies, localStorage, etc)
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    // Force a clean slate
    storageState: undefined
  });
  
  const page = await context.newPage();
  
  console.log('🔍 Testing with completely fresh browser context...');
  console.log('   (No localStorage, no cookies, first time visitor)\n');
  
  await page.goto('http://localhost:3000', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  // Wait for React to fully render
  await page.waitForTimeout(2000);
  
  // Check dark mode state
  const isDarkMode = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });
  
  const theme = await page.evaluate(() => {
    return localStorage.getItem('theme');
  });
  
  const backgroundColor = await page.evaluate(() => {
    const body = document.body;
    return window.getComputedStyle(body).backgroundColor;
  });
  
  const toggleButton = await page.$('button[title*="mode"], button[aria-label*="mode"]');
  const toggleTitle = toggleButton ? await toggleButton.getAttribute('title') : 'Not found';
  
  console.log('📊 Fresh Browser Test Results:');
  console.log(`  ✓ Dark class on <html>: ${isDarkMode ? '✅ YES' : '❌ NO'}`);
  console.log(`  ✓ Theme in localStorage: ${theme || 'NOT SET'}`);
  console.log(`  ✓ Background color: ${backgroundColor}`);
  console.log(`  ✓ Toggle button state: ${toggleTitle}`);
  
  if (isDarkMode && backgroundColor.includes('17, 24, 39')) {
    console.log('\n✅ SUCCESS: Dark mode is the default for new users!');
  } else {
    console.log('\n❌ ISSUE: Dark mode is not properly set as default');
    console.log('   Expected dark background: rgb(17, 24, 39)');
    console.log('   Got:', backgroundColor);
  }
  
  // Take screenshot
  await page.screenshot({ 
    path: 'fresh-browser-dark-mode.png',
    fullPage: true 
  });
  console.log('\n📸 Screenshot saved: fresh-browser-dark-mode.png');
  
  console.log('\nKeeping browser open for 5 seconds...');
  await page.waitForTimeout(5000);
  
  await browser.close();
}

testFreshDarkMode().catch(console.error);