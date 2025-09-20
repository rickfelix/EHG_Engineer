import { chromium } from 'playwright';

async function capturePaddingIssue() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  console.log('📸 Capturing current padding state...');
  await page.goto('http://localhost:3000/directive-lab');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Take full page screenshot to see all padding
  await page.screenshot({ 
    path: 'padding-issue-full.png',
    fullPage: true
  });
  
  // Take viewport screenshot to see top area
  await page.screenshot({ 
    path: 'padding-issue-top.png',
    fullPage: false
  });
  
  // Measure the padding/margin around the main container
  const measurements = await page.evaluate(() => {
    const container = document.querySelector('main') || document.querySelector('[class*="container"]');
    const headerBox = document.querySelector('[class*="bg-white"][class*="rounded-lg"]');
    
    if (container && headerBox) {
      const containerRect = container.getBoundingClientRect();
      const headerRect = headerBox.getBoundingClientRect();
      const computedContainer = window.getComputedStyle(container);
      const computedHeader = window.getComputedStyle(headerBox);
      
      return {
        container: {
          paddingTop: computedContainer.paddingTop,
          paddingBottom: computedContainer.paddingBottom,
          marginTop: computedContainer.marginTop,
          marginBottom: computedContainer.marginBottom,
          top: containerRect.top
        },
        header: {
          marginTop: computedHeader.marginTop,
          top: headerRect.top,
          distanceFromTop: headerRect.top
        },
        bodyPaddingTop: window.getComputedStyle(document.body).paddingTop,
        htmlPaddingTop: window.getComputedStyle(document.documentElement).paddingTop
      };
    }
    return null;
  });
  
  console.log('Measurements:', measurements);
  
  // Check for any wrapper divs with padding
  const wrapperPadding = await page.evaluate(() => {
    const allDivs = Array.from(document.querySelectorAll('div'));
    const paddingInfo = [];
    
    allDivs.forEach(div => {
      const computed = window.getComputedStyle(div);
      const paddingTop = parseInt(computed.paddingTop);
      const paddingBottom = parseInt(computed.paddingBottom);
      
      if (paddingTop > 20 || paddingBottom > 20) {
        paddingInfo.push({
          className: div.className || 'no-class',
          paddingTop: computed.paddingTop,
          paddingBottom: computed.paddingBottom,
          id: div.id || 'no-id'
        });
      }
    });
    
    return paddingInfo;
  });
  
  console.log('Elements with significant padding:');
  wrapperPadding.forEach(item => {
    console.log(`  - ${item.id || item.className}: top=${item.paddingTop}, bottom=${item.paddingBottom}`);
  });
  
  await browser.close();
  console.log('✅ Screenshots captured!');
}

capturePaddingIssue().catch(console.error);