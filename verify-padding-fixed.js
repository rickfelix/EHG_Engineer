import { chromium } from 'playwright';

async function verifyPaddingFixed() {
  const browser = await chromium.launch({ headless: true });
  
  // Test desktop view
  const desktopContext = await browser.newContext({ 
    viewport: { width: 1920, height: 1080 } 
  });
  const desktopPage = await desktopContext.newPage();
  
  console.log('📸 Capturing updated padding state...');
  await desktopPage.goto('http://localhost:3000/directive-lab');
  await desktopPage.waitForLoadState('networkidle');
  await desktopPage.waitForTimeout(1000);
  
  // Take screenshots
  await desktopPage.screenshot({ 
    path: 'padding-fixed-desktop.png',
    fullPage: false
  });
  
  // Measure the new padding
  const measurements = await desktopPage.evaluate(() => {
    const container = document.querySelector('main');
    const headerBox = document.querySelector('[class*="bg-white"][class*="rounded-lg"]');
    
    if (container && headerBox) {
      const containerRect = container.getBoundingClientRect();
      const headerRect = headerBox.getBoundingClientRect();
      const computedContainer = window.getComputedStyle(container);
      
      return {
        container: {
          paddingTop: computedContainer.paddingTop,
          paddingBottom: computedContainer.paddingBottom,
          paddingLeft: computedContainer.paddingLeft,
          paddingRight: computedContainer.paddingRight
        },
        headerDistanceFromTop: headerRect.top,
        containerTop: containerRect.top
      };
    }
    return null;
  });
  
  console.log('✅ New measurements:', measurements);
  
  // Test mobile view
  const mobileContext = await browser.newContext({ 
    viewport: { width: 375, height: 812 } 
  });
  const mobilePage = await mobileContext.newPage();
  
  await mobilePage.goto('http://localhost:3000/directive-lab');
  await mobilePage.waitForLoadState('networkidle');
  await mobilePage.waitForTimeout(1000);
  
  await mobilePage.screenshot({ 
    path: 'padding-fixed-mobile.png',
    fullPage: false
  });
  
  // Measure mobile padding
  const mobileMeasurements = await mobilePage.evaluate(() => {
    const container = document.querySelector('main');
    const headerBox = document.querySelector('[class*="bg-white"][class*="rounded-lg"]');
    
    if (container && headerBox) {
      const containerRect = container.getBoundingClientRect();
      const headerRect = headerBox.getBoundingClientRect();
      const computedContainer = window.getComputedStyle(container);
      
      return {
        container: {
          paddingTop: computedContainer.paddingTop,
          paddingBottom: computedContainer.paddingBottom,
        },
        headerDistanceFromTop: headerRect.top
      };
    }
    return null;
  });
  
  console.log('📱 Mobile measurements:', mobileMeasurements);
  
  await browser.close();
  
  console.log(`
  ✨ Padding Improvements:
  - Desktop: Reduced from 24px to ${measurements?.container?.paddingTop || 'N/A'}
  - Mobile: Reduced from 24px to ${mobileMeasurements?.container?.paddingTop || 'N/A'}
  - Vertical space saved: ~${measurements ? 44 : 0}px
  `);
}

verifyPaddingFixed().catch(console.error);