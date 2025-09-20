import { chromium } from 'playwright';

async function captureDashboard() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Console Error:', msg.text());
    }
  });
  
  // Navigate to dashboard
  console.log('🔍 Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  // Wait a bit for React to fully render
  await page.waitForTimeout(2000);
  
  // Check for dark mode
  const isDarkMode = await page.evaluate(() => {
    return document.documentElement.classList.contains('dark');
  });
  console.log(`🌙 Dark mode active: ${isDarkMode}`);
  
  // Check for toggle button
  const toggleButton = await page.$('[title*="mode"], [aria-label*="mode"], button:has(svg)');
  console.log(`🔘 Toggle button found: ${toggleButton ? 'YES' : 'NO'}`);
  
  // Get theme from localStorage
  const theme = await page.evaluate(() => {
    return localStorage.getItem('theme');
  });
  console.log(`💾 Theme in localStorage: ${theme}`);
  
  // Check if DarkModeToggle component exists
  const darkModeComponent = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    return allButtons.some(btn => 
      btn.title?.includes('mode') || 
      btn.getAttribute('aria-label')?.includes('mode')
    );
  });
  console.log(`🧩 DarkModeToggle component rendered: ${darkModeComponent}`);
  
  // Get page title and check basic rendering
  const title = await page.title();
  console.log(`📄 Page title: ${title}`);
  
  // Check for main app container
  const appRoot = await page.$('#root');
  const hasContent = await page.evaluate(() => {
    const root = document.getElementById('root');
    return root && root.children.length > 0;
  });
  console.log(`📦 App root has content: ${hasContent}`);
  
  // Take screenshots
  await page.screenshot({ 
    path: 'dashboard-current-state.png',
    fullPage: true 
  });
  console.log('📸 Screenshot saved: dashboard-current-state.png');
  
  // Get all buttons on page for debugging
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(btn => ({
      text: btn.textContent?.trim(),
      classes: btn.className,
      title: btn.title,
      ariaLabel: btn.getAttribute('aria-label')
    }));
  });
  console.log('🔘 All buttons found:', JSON.stringify(buttons, null, 2));
  
  // Check for any React errors
  const reactErrors = await page.evaluate(() => {
    const errorElement = document.querySelector('#root > div[style*="red"]');
    return errorElement ? errorElement.textContent : null;
  });
  if (reactErrors) {
    console.log('⚠️ React Error:', reactErrors);
  }
  
  await browser.close();
  console.log('\n✅ Dashboard analysis complete!');
}

captureDashboard().catch(console.error);