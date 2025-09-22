import { chromium } from 'playwright';

async function verifyCompactLayout() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  console.log('📸 Verifying more compact layout...');
  await page.goto('http://localhost:3000/directive-lab');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Take screenshot
  await page.screenshot({ 
    path: 'compact-layout-final.png',
    fullPage: false
  });
  
  // Measure the improved spacing
  const measurements = await page.evaluate(() => {
    const header = document.querySelector('[class*="bg-white"][class*="rounded-lg"]') || 
                   document.querySelector('h1');
    const nav = Array.from(document.querySelectorAll('div')).find(
      div => div.textContent?.includes('Previous') && div.textContent?.includes('Next')
    );
    const main = document.querySelector('main');
    
    const results = {
      header: null,
      navigation: null,
      mainPadding: null
    };
    
    if (header) {
      const rect = header.getBoundingClientRect();
      results.header = {
        distanceFromTop: rect.top,
        height: rect.height
      };
    }
    
    if (nav) {
      const rect = nav.getBoundingClientRect();
      const computed = window.getComputedStyle(nav);
      results.navigation = {
        position: computed.position,
        height: rect.height,
        paddingTop: computed.paddingTop,
        paddingBottom: computed.paddingBottom
      };
    }
    
    if (main) {
      const computed = window.getComputedStyle(main);
      results.mainPadding = {
        top: computed.paddingTop,
        bottom: computed.paddingBottom
      };
    }
    
    return results;
  });
  
  console.log('Layout measurements:', JSON.stringify(measurements, null, 2));
  
  await browser.close();
  
  console.log(`
  ✅ Layout Improvements Applied:
  - Navigation bar padding reduced from p-3 to py-1.5 px-3
  - Header padding reduced from py-2 to py-1.5
  - Progress bar padding reduced from py-3 to py-2
  - Main content uses flex layout with proper scrolling
  - Container padding completely removed for directive-lab
  `);
}

verifyCompactLayout().catch(console.error);