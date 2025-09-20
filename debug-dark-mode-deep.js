import { chromium } from 'playwright';

async function deepDebugDarkMode() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('🔍 DEEP DEBUG: Monitoring dark mode class changes...\n');
  
  // Inject a mutation observer before page loads
  await page.addInitScript(() => {
    // Track all class changes on documentElement
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          console.log('[DOM MUTATION]', {
            time: new Date().toISOString(),
            oldClass: mutation.oldValue,
            newClass: target.className,
            hasDark: target.classList.contains('dark'),
            caller: new Error().stack.split('\n')[2]
          });
        }
      });
    });
    
    // Start observing as soon as possible
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class']
      });
      console.log('[OBSERVER] Started monitoring documentElement');
    }
    
    // Also log when React components mount
    window.addEventListener('DOMContentLoaded', () => {
      console.log('[EVENT] DOMContentLoaded fired');
    });
    
    // Track localStorage changes
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === 'theme') {
        console.log('[LOCALSTORAGE] Setting theme to:', value);
      }
      return originalSetItem.call(this, key, value);
    };
  });
  
  // Listen to console logs from the page
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DOM MUTATION]') || 
        text.includes('[OBSERVER]') || 
        text.includes('[EVENT]') || 
        text.includes('[LOCALSTORAGE]')) {
      console.log(text);
    }
  });
  
  console.log('📍 Navigating to http://localhost:3000...\n');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  
  // Wait for React to settle
  await page.waitForTimeout(2000);
  
  // Check final state
  const finalState = await page.evaluate(() => {
    return {
      darkClass: document.documentElement.classList.contains('dark'),
      allClasses: document.documentElement.className,
      localStorage: localStorage.getItem('theme'),
      computedBg: window.getComputedStyle(document.body).backgroundColor,
      reactRoot: document.getElementById('root')?.children.length > 0
    };
  });
  
  console.log('\n📊 FINAL STATE:');
  console.log('  Dark class present:', finalState.darkClass ? '✅' : '❌');
  console.log('  All classes:', finalState.allClasses || '(none)');
  console.log('  localStorage theme:', finalState.localStorage);
  console.log('  Background color:', finalState.computedBg);
  console.log('  React rendered:', finalState.reactRoot ? '✅' : '❌');
  
  // Now test with a delay approach
  console.log('\n🧪 TESTING: Applying dark class with delay...');
  await page.evaluate(() => {
    setTimeout(() => {
      document.documentElement.classList.add('dark');
      console.log('[TEST] Applied dark class after delay');
    }, 100);
  });
  
  await page.waitForTimeout(500);
  
  const afterDelay = await page.evaluate(() => {
    return {
      darkClass: document.documentElement.classList.contains('dark'),
      bg: window.getComputedStyle(document.body).backgroundColor
    };
  });
  
  console.log('\nAfter delay:');
  console.log('  Dark class:', afterDelay.darkClass ? '✅' : '❌');
  console.log('  Background:', afterDelay.bg);
  
  if (afterDelay.darkClass && afterDelay.bg.includes('17, 24, 39')) {
    console.log('\n✅ DISCOVERY: Dark mode works when applied after React settles!');
    console.log('   Solution: Add a small delay in the component mount');
  }
  
  await page.screenshot({ path: 'debug-deep-dive.png' });
  console.log('\n📸 Screenshot saved: debug-deep-dive.png');
  
  console.log('\nKeeping browser open for inspection...');
  await page.waitForTimeout(10000);
  
  await browser.close();
}

deepDebugDarkMode().catch(console.error);