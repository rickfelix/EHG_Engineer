import { chromium } from 'playwright';

async function testDarkDefault() {
  const browser = await chromium.launch({ headless: true });
  
  // Test with no localStorage (new user)
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  console.log('🔍 Testing default theme (no localStorage)...');
  await page.goto('http://localhost:3000', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  await page.waitForTimeout(1000);
  
  // Check if dark mode is active by default
  const isDarkMode = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });
  
  const theme = await page.evaluate(() => {
    return localStorage.getItem('theme');
  });
  
  const backgroundColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  
  console.log('\n📊 Default Theme Test Results:');
  console.log(`  Dark class applied: ${isDarkMode ? '✅ YES' : '❌ NO'}`);
  console.log(`  Theme in localStorage: ${theme || 'NOT SET (will be set to dark)'}`);
  console.log(`  Background color: ${backgroundColor}`);
  
  if (isDarkMode) {
    console.log('\n✅ SUCCESS: Dark mode is the default!');
  } else {
    console.log('\n❌ FAILED: Dark mode is NOT the default');
  }
  
  // Take screenshot
  await page.screenshot({ 
    path: 'default-theme-test.png',
    fullPage: true 
  });
  console.log('📸 Screenshot saved: default-theme-test.png');
  
  await browser.close();
}

testDarkDefault().catch(console.error);