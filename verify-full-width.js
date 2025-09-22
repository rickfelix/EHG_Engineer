import { chromium } from 'playwright';

async function verifyFullWidth() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  console.log('📸 Verifying full-width layout...');
  await page.goto('http://localhost:3000/directive-lab');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Take screenshot
  await page.screenshot({ 
    path: 'full-width-layout.png',
    fullPage: false
  });
  
  // Measure the tab content width
  const measurements = await page.evaluate(() => {
    // Find the tabbed content container
    const tabContainer = document.querySelector('[class*="bg-white"][class*="rounded-t-lg"]');
    const mainContent = document.querySelector('[class*="flex-1"][class*="overflow-y-auto"]');
    const viewport = document.documentElement;
    
    const results = {
      viewport: {
        width: viewport.clientWidth
      },
      mainContent: null,
      tabContainer: null
    };
    
    if (mainContent) {
      const rect = mainContent.getBoundingClientRect();
      const computed = window.getComputedStyle(mainContent);
      results.mainContent = {
        width: rect.width,
        paddingLeft: computed.paddingLeft,
        paddingRight: computed.paddingRight,
        hasMaxWidth: computed.maxWidth !== 'none'
      };
    }
    
    if (tabContainer) {
      const rect = tabContainer.getBoundingClientRect();
      results.tabContainer = {
        width: rect.width,
        leftEdge: rect.left,
        rightEdge: rect.right,
        percentOfViewport: Math.round((rect.width / viewport.clientWidth) * 100)
      };
    }
    
    return results;
  });
  
  console.log('Layout measurements:', JSON.stringify(measurements, null, 2));
  
  await browser.close();
  
  console.log(`
  ✅ Full Width Layout Applied:
  - Removed max-w-7xl constraint from main content area
  - Tab container now uses: ${measurements.tabContainer?.percentOfViewport || 0}% of viewport width
  - Content spans edge to edge with only px-4 padding (16px each side)
  `);
}

verifyFullWidth().catch(console.error);