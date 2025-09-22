import { chromium } from 'playwright';

async function captureDirectiveLab() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  console.log('📸 Navigating to DirectiveLab page...');
  await page.goto('http://localhost:3000/directive-lab');
  
  // Wait for the page to fully load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Take a full page screenshot
  await page.screenshot({ 
    path: 'directive-lab-compact.png',
    fullPage: false // viewport only to see what's cut off
  });
  
  console.log('✅ Screenshot saved as directive-lab-compact.png');
  
  // Also capture with scrolling to see full content
  await page.screenshot({ 
    path: 'directive-lab-full.png',
    fullPage: true
  });
  
  console.log('✅ Full page screenshot saved as directive-lab-full.png');
  
  // Get the height of the content area
  const contentHeight = await page.evaluate(() => {
    const tabContent = document.querySelector('.bg-white.dark\\:bg-gray-800.rounded-b-lg');
    return tabContent ? tabContent.offsetHeight : null;
  });
  
  console.log(`📏 Tab content height: ${contentHeight}px`);
  
  // Check if buttons are visible in viewport
  const buttonsVisible = await page.evaluate(() => {
    const submitButton = Array.from(document.querySelectorAll('button')).find(
      btn => btn.textContent.includes('Submit & Analyze')
    );
    
    if (submitButton) {
      const rect = submitButton.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      return {
        visible: isVisible,
        position: {
          top: rect.top,
          bottom: rect.bottom,
          viewportHeight: window.innerHeight
        }
      };
    }
    return null;
  });
  
  console.log('🔍 Button visibility:', buttonsVisible);
  
  await browser.close();
}

captureDirectiveLab().catch(console.error);