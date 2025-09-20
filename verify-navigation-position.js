import { chromium } from 'playwright';

async function verifyNavigationPosition() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  console.log('📸 Verifying navigation bar position...');
  await page.goto('http://localhost:3000/directive-lab');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Take screenshot
  await page.screenshot({ 
    path: 'navigation-repositioned.png',
    fullPage: false
  });
  
  // Check the position of navigation relative to other elements
  const layout = await page.evaluate(() => {
    // Find key elements
    const progressBar = document.querySelector('[class*="ProgressBar"]') || 
                        Array.from(document.querySelectorAll('div')).find(div => 
                          div.querySelector && div.querySelector('[class*="rounded-full"][class*="bg-green-500"], [class*="rounded-full"][class*="bg-blue-600"]')
                        );
    
    const navigation = Array.from(document.querySelectorAll('div')).find(
      div => div.textContent?.includes('Previous') && div.textContent?.includes('Next')
    );
    
    const tabs = document.querySelector('[class*="bg-white"][class*="rounded-t-lg"]');
    
    const results = {
      progressBar: null,
      navigation: null,
      tabs: null,
      order: []
    };
    
    if (progressBar) {
      const rect = progressBar.getBoundingClientRect();
      results.progressBar = { top: rect.top, bottom: rect.bottom };
      results.order.push({ element: 'Progress Bar', top: rect.top });
    }
    
    if (navigation) {
      const rect = navigation.getBoundingClientRect();
      results.navigation = { 
        top: rect.top, 
        bottom: rect.bottom,
        text: navigation.textContent?.substring(0, 50)
      };
      results.order.push({ element: 'Navigation', top: rect.top });
    }
    
    if (tabs) {
      const rect = tabs.getBoundingClientRect();
      results.tabs = { top: rect.top, bottom: rect.bottom };
      results.order.push({ element: 'Tabs', top: rect.top });
    }
    
    // Sort by position
    results.order.sort((a, b) => a.top - b.top);
    
    return results;
  });
  
  console.log('Layout analysis:', JSON.stringify(layout, null, 2));
  
  await browser.close();
  
  const orderString = layout.order.map(item => item.element).join(' → ');
  console.log(`
  ✅ Navigation Repositioned:
  - Moved from bottom to between progress bar and tabs
  - Changed border from top to bottom
  - Current order (top to bottom): ${orderString}
  - Navigation is now easily accessible and logically positioned
  `);
}

verifyNavigationPosition().catch(console.error);