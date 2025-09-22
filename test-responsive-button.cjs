const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🔍 Testing responsive Manual Refresh button...\n');
  
  // Navigate to dashboard
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForSelector('#root', { timeout: 5000 });
  await page.waitForTimeout(2000); // Wait for React to fully render
  
  // Take screenshot with expanded sidebar
  console.log('📸 Capturing expanded sidebar state...');
  await page.screenshot({ path: 'button-expanded.png', fullPage: false });
  
  // Find and click the sidebar toggle button (chevron icon)
  const toggleButton = await page.$('button[title*="Collapse"]');
  if (toggleButton) {
    console.log('🔄 Collapsing sidebar...');
    await toggleButton.click();
    await page.waitForTimeout(500); // Wait for animation
    
    // Take screenshot with collapsed sidebar
    console.log('📸 Capturing collapsed sidebar state...');
    await page.screenshot({ path: 'button-collapsed.png', fullPage: false });
    
    // Check if Manual Refresh button is visible and not truncated
    const refreshButton = await page.$('button[title*="Manual Refresh"]');
    if (refreshButton) {
      const buttonBox = await refreshButton.boundingBox();
      console.log(`\n✅ Manual Refresh button dimensions in collapsed state:`);
      console.log(`   Width: ${buttonBox.width}px`);
      console.log(`   Height: ${buttonBox.height}px`);
      
      // Check if text is visible (should only show icon in collapsed state)
      const buttonText = await refreshButton.textContent();
      if (buttonText.includes('Manual Refresh')) {
        console.log('⚠️  Text is still visible in collapsed state (should be icon only)');
      } else {
        console.log('✅ Button shows icon only in collapsed state');
      }
      
      // Test hover state for tooltip
      console.log('\n🖱️  Testing hover tooltip...');
      await refreshButton.hover();
      await page.waitForTimeout(600); // Wait for tooltip delay
      
      // Take screenshot with hover state
      await page.screenshot({ path: 'button-collapsed-hover.png', fullPage: false });
      
      // Click to test functionality
      console.log('🔄 Testing button click in collapsed state...');
      await refreshButton.click();
      await page.waitForTimeout(1000);
      
      // Expand sidebar again
      const expandButton = await page.$('button[title*="Expand"]');
      if (expandButton) {
        console.log('\n🔄 Expanding sidebar again...');
        await expandButton.click();
        await page.waitForTimeout(500);
        
        // Check expanded state
        const refreshButtonExpanded = await page.$('button[title*="Manual Refresh"]');
        if (refreshButtonExpanded) {
          const expandedText = await refreshButtonExpanded.textContent();
          if (expandedText.includes('Manual Refresh')) {
            console.log('✅ Text is visible in expanded state');
          } else {
            console.log('⚠️  Text is missing in expanded state');
          }
        } else {
          console.log('⚠️  Could not find button after expanding');
        }
      }
    } else {
      console.log('❌ Manual Refresh button not found');
    }
  } else {
    console.log('❌ Sidebar toggle button not found');
  }
  
  console.log('\n✅ Responsive button test complete!');
  console.log('📁 Screenshots saved: button-expanded.png, button-collapsed.png, button-collapsed-hover.png');
  
  await browser.close();
})();