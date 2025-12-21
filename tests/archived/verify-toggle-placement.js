/**
 * Verify Dark Mode Toggle Placement
 * Ensures toggle appears LEFT of title on DirectiveLab page
 */

import { chromium } from 'playwright';

async function verifyTogglePlacement() {
  console.log('🔍 Verifying Dark Mode Toggle Placement\n');
  console.log('=' .repeat(50));
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    // Navigate to DirectiveLab
    await page.goto('http://localhost:3000/directive-lab');
    await page.waitForLoadState('networkidle');
    
    // Wait a moment for React to render
    await page.waitForTimeout(2000);
    
    // Find ALL toggle buttons on the page
    const toggles = await page.locator('button[aria-label*="mode"]').all();
    console.log(`\n📊 Found ${toggles.length} toggle button(s) on the page`);
    
    // Get details of each toggle
    for (let i = 0; i < toggles.length; i++) {
      const toggleInfo = await toggles[i].evaluate((el, idx) => {
        const rect = el.getBoundingClientRect();
        const parent = el.closest('div[class*="flex"]');
        const parentText = parent ? parent.textContent : 'Unknown';
        
        return {
          index: idx,
          left: rect.left,
          top: rect.top,
          visible: el.offsetParent !== null,
          parentText: parentText.substring(0, 50),
          ariaLabel: el.getAttribute('aria-label')
        };
      }, i);
      
      console.log(`\nToggle ${i + 1}:`);
      console.log(`  Position: ${toggleInfo.left}px from left, ${toggleInfo.top}px from top`);
      console.log(`  Visible: ${toggleInfo.visible ? '✅' : '❌'}`);
      console.log(`  Parent context: "${toggleInfo.parentText}..."`);
      console.log(`  Aria label: ${toggleInfo.ariaLabel}`);
    }
    
    // Find the Directive Lab title
    const titleInfo = await page.evaluate(() => {
      const title = document.querySelector('h1');
      if (!title) return null;
      
      const rect = title.getBoundingClientRect();
      return {
        text: title.textContent,
        left: rect.left,
        top: rect.top
      };
    });
    
    if (titleInfo) {
      console.log(`\n📍 Title "${titleInfo.text}":`);
      console.log(`  Position: ${titleInfo.left}px from left`);
    }
    
    // Check if DirectiveLab has its own header with toggle
    const directiveLabHeader = await page.evaluate(() => {
      // Look for the DirectiveLab specific header
      const headers = Array.from(document.querySelectorAll('div[class*="bg-white"]'));
      for (const header of headers) {
        if (header.textContent.includes('Directive Lab')) {
          const toggle = header.querySelector('button[aria-label*="mode"]');
          const title = header.querySelector('h1');
          
          if (toggle && title) {
            const toggleRect = toggle.getBoundingClientRect();
            const titleRect = title.getBoundingClientRect();
            
            return {
              found: true,
              toggleLeft: toggleRect.left,
              titleLeft: titleRect.left,
              isLeftOfTitle: toggleRect.right < titleRect.left,
              headerText: header.textContent.substring(0, 100)
            };
          }
        }
      }
      return { found: false };
    });
    
    console.log('\n🎯 DirectiveLab Header Analysis:');
    if (directiveLabHeader.found) {
      console.log('  ✅ DirectiveLab header found');
      console.log(`  Toggle position: ${directiveLabHeader.toggleLeft}px`);
      console.log(`  Title position: ${directiveLabHeader.titleLeft}px`);
      console.log(`  Toggle is LEFT of title: ${directiveLabHeader.isLeftOfTitle ? '✅ YES' : '❌ NO'}`);
      
      return directiveLabHeader.isLeftOfTitle;
    } else {
      console.log('  ❌ DirectiveLab header with toggle not found');
      return false;
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  } finally {
    // Keep browser open for visual inspection
    console.log('\n⏸️  Browser will stay open for 5 seconds for visual inspection...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

// Run verification
verifyTogglePlacement().then(success => {
  console.log('\n' + '='.repeat(50));
  console.log(success ? '✅ TOGGLE CORRECTLY POSITIONED' : '❌ TOGGLE POSITION INCORRECT');
  process.exit(success ? 0 : 1);
});