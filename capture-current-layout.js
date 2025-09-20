import { chromium } from 'playwright';

async function captureCurrentLayout() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  console.log('📸 Capturing current layout...');
  await page.goto('http://localhost:3000/directive-lab');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Take screenshot
  await page.screenshot({ 
    path: 'current-layout-issue.png',
    fullPage: false
  });
  
  // Check for fixed/sticky navigation
  const navInfo = await page.evaluate(() => {
    const nav = document.querySelector('[class*="fixed bottom"]') || 
                document.querySelector('[class*="sticky bottom"]') ||
                document.querySelector('div[class*="bottom-0"]');
    
    if (nav) {
      const computed = window.getComputedStyle(nav);
      return {
        found: true,
        position: computed.position,
        bottom: computed.bottom,
        classes: nav.className,
        text: nav.textContent?.substring(0, 50)
      };
    }
    
    // Also check for NavigationBar component
    const navBar = Array.from(document.querySelectorAll('div')).find(
      div => div.textContent?.includes('Previous') && div.textContent?.includes('Next')
    );
    
    if (navBar) {
      const computed = window.getComputedStyle(navBar);
      return {
        found: true,
        position: computed.position,
        bottom: computed.bottom,
        classes: navBar.className,
        isFixed: computed.position === 'fixed' || computed.position === 'sticky'
      };
    }
    
    return { found: false };
  });
  
  console.log('Navigation info:', navInfo);
  
  // Check the actual padding/margins
  const spacing = await page.evaluate(() => {
    const main = document.querySelector('main');
    const body = document.body;
    const header = document.querySelector('[class*="bg-white"][class*="rounded-lg"]');
    
    const mainComputed = main ? window.getComputedStyle(main) : null;
    const headerRect = header ? header.getBoundingClientRect() : null;
    
    return {
      main: {
        paddingTop: mainComputed?.paddingTop,
        marginTop: mainComputed?.marginTop,
      },
      headerDistanceFromTop: headerRect?.top,
      bodyPaddingTop: window.getComputedStyle(body).paddingTop,
      scrollY: window.scrollY
    };
  });
  
  console.log('Spacing measurements:', spacing);
  
  await browser.close();
  console.log('✅ Analysis complete!');
}

captureCurrentLayout().catch(console.error);