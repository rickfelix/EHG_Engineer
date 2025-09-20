import { chromium } from 'playwright';

async function captureResponsiveBehavior() {
  const browser = await chromium.launch({ headless: true });
  
  // Test different viewport widths
  const viewports = [
    { width: 375, height: 812, name: 'mobile' },
    { width: 640, height: 900, name: 'tablet-small' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 1024, height: 768, name: 'desktop-small' },
    { width: 1920, height: 1080, name: 'desktop' }
  ];
  
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    
    console.log(`\n📱 Testing at ${viewport.width}x${viewport.height} (${viewport.name})`);
    await page.goto('http://localhost:3000/directive-lab');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `progress-${viewport.name}-${viewport.width}.png`,
      fullPage: false
    });
    
    // Check if progress bar is vertical or horizontal
    const progressOrientation = await page.evaluate(() => {
      const progressBar = document.querySelector('[class*="flex"][class*="gap"]');
      if (!progressBar) return 'not found';
      
      const classes = progressBar.className;
      if (classes.includes('flex-col')) return 'vertical';
      if (classes.includes('flex-row')) return 'horizontal';
      
      // Check computed styles as fallback
      const computed = window.getComputedStyle(progressBar);
      return computed.flexDirection === 'column' ? 'vertical' : 'horizontal';
    });
    
    console.log(`  Progress bar orientation: ${progressOrientation}`);
    
    // Check if mobile navigation is visible
    const mobileNavVisible = await page.evaluate(() => {
      const mobileNav = Array.from(document.querySelectorAll('div')).find(
        div => div.textContent?.includes('Step') && div.textContent?.includes('of 7')
      );
      if (mobileNav) {
        const rect = mobileNav.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
      return false;
    });
    
    console.log(`  Mobile navigation visible: ${mobileNavVisible}`);
    
    // Check if step text is visible
    const stepTextVisible = await page.evaluate(() => {
      const stepText = document.querySelector('[class*="text-"][class*="gray"]:not([class*="text-xs"])');
      if (stepText && stepText.textContent?.includes('Intent Confirmation')) {
        return true;
      }
      // Check for any step labels
      const hasLabels = Array.from(document.querySelectorAll('span, div')).some(
        el => el.textContent?.includes('Input & Screenshot') || 
              el.textContent?.includes('Intent Confirmation')
      );
      return hasLabels;
    });
    
    console.log(`  Step text labels visible: ${stepTextVisible}`);
    
    await context.close();
  }
  
  await browser.close();
  console.log('\n✅ All screenshots captured!');
}

captureResponsiveBehavior().catch(console.error);