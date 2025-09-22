import { chromium } from 'playwright';

async function toggleDarkMode() {
  const browser = await chromium.launch({ headless: false }); // Show browser
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  console.log('🔍 Navigating to dashboard...');
  await page.goto('http://localhost:3000', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  await page.waitForTimeout(2000);
  
  // Check initial state
  const isDarkBefore = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });
  console.log(`🌙 Dark mode before click: ${isDarkBefore}`);
  
  // Find and click the toggle button
  console.log('🔍 Looking for dark mode toggle...');
  const toggleButton = await page.$('button[title*="mode"], button[aria-label*="mode"]');
  
  if (toggleButton) {
    console.log('✅ Found toggle button, clicking it...');
    await toggleButton.click();
    await page.waitForTimeout(1000);
    
    // Check state after click
    const isDarkAfter = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark');
    });
    console.log(`🌙 Dark mode after click: ${isDarkAfter}`);
    
    // Take screenshot
    await page.screenshot({ 
      path: 'after-toggle-click.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved: after-toggle-click.png');
    
    // Check localStorage
    const theme = await page.evaluate(() => {
      return localStorage.getItem('theme');
    });
    console.log(`💾 Theme in localStorage: ${theme}`);
    
  } else {
    console.log('❌ Toggle button not found');
  }
  
  console.log('\nKeeping browser open for 10 seconds so you can see the result...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('✅ Done!');
}

toggleDarkMode().catch(console.error);