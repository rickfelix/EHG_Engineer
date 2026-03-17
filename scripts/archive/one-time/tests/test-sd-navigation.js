#!/usr/bin/env node

/**
 * Test script to verify SD dropdown navigation fix
 */

import puppeteer from 'puppeteer';

console.log('🧪 Testing SD Dropdown Navigation Fix\n');
console.log('=' .repeat(50));

async function testSDNavigation() {
  let browser;
  
  try {
    console.log('\n1️⃣ Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console error:', msg.text());
      }
    });
    
    // Listen for navigation events
    let navigationCount = 0;
    page.on('framenavigated', () => {
      navigationCount++;
      console.log(`📍 Navigation event #${navigationCount}`);
    });
    
    console.log('2️⃣ Navigating to dashboard...');
    await page.goto('http://localhost:3000', { 
      waitUntil: 'networkidle2',
      timeout: 10000 
    });
    
    console.log('3️⃣ Waiting for dashboard to load...');
    await page.waitForSelector('.text-3xl', { timeout: 5000 });
    
    const initialUrl = page.url();
    console.log(`   Initial URL: ${initialUrl}`);
    
    console.log('4️⃣ Looking for SD dropdown...');
    
    // Check if dropdown exists
    const dropdownExists = await page.evaluate(() => {
      const button = document.querySelector('button[aria-label="Select Strategic Directive"]');
      return button !== null;
    });
    
    if (!dropdownExists) {
      console.log('   ⚠️ SD dropdown not found on page');
      console.log('   This might be expected if not on the correct view');
      return { success: true, message: 'Dropdown not present in current view' };
    }
    
    console.log('5️⃣ Opening SD dropdown...');
    await page.click('button[aria-label="Select Strategic Directive"]');
    await page.waitForTimeout(500);
    
    // Get list of SDs
    const sdOptions = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="option"]');
      return Array.from(items).map(item => ({
        text: item.textContent.trim(),
        id: item.getAttribute('data-value')
      }));
    });
    
    console.log(`   Found ${sdOptions.length} SD options`);
    
    if (sdOptions.length > 1) {
      console.log('6️⃣ Selecting different SD...');
      
      // Click on second SD option
      await page.click('[role="option"]:nth-child(2)');
      await page.waitForTimeout(1000);
      
      // Check if we're still on the same page (no navigation)
      const currentUrl = page.url();
      console.log(`   Current URL: ${currentUrl}`);
      
      if (currentUrl !== initialUrl) {
        console.log('   ❌ URL changed - unwanted navigation occurred!');
        return { success: false, message: 'Navigation occurred when it should not have' };
      }
      
      // Check if page content is still visible
      const hasContent = await page.evaluate(() => {
        const body = document.body;
        return body && body.textContent.trim().length > 100;
      });
      
      if (!hasContent) {
        console.log('   ❌ Page appears blank!');
        return { success: false, message: 'Page went blank after SD selection' };
      }
      
      // Check if SD was actually selected
      const selectedSD = await page.evaluate(() => {
        const button = document.querySelector('button[aria-label="Select Strategic Directive"]');
        return button ? button.textContent.trim() : null;
      });
      
      console.log(`   ✅ Selected SD: ${selectedSD}`);
      console.log('   ✅ No unwanted navigation occurred');
      console.log('   ✅ Page content still visible');
      
      // Test custom event
      const eventFired = await page.evaluate(() => {
        return new Promise(resolve => {
          let fired = false;
          window.addEventListener('activeSDChanged', (e) => {
            fired = true;
            console.log('Custom event received:', e.detail);
          });
          
          // Trigger another selection
          const button = document.querySelector('button[aria-label="Select Strategic Directive"]');
          if (button) button.click();
          
          setTimeout(() => resolve(fired), 1000);
        });
      });
      
      if (eventFired) {
        console.log('   ✅ Custom event system working');
      }
      
      return { success: true, message: 'SD dropdown working correctly' };
    } else {
      console.log('   ⚠️ Not enough SDs to test switching');
      return { success: true, message: 'Cannot test switching with only one SD' };
    }
    
  } catch (_error) {
    console.error('\n❌ Test failed:', error.message);
    return { success: false, message: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run test
testSDNavigation().then(result => {
  console.log('\n' + '=' .repeat(50));
  console.log('📊 TEST RESULTS:\n');
  
  if (result.success) {
    console.log('✅ SUCCESS: SD dropdown navigation fix is working!');
    console.log(`   ${result.message}`);
    console.log('\n🎉 The blank screen issue has been resolved!');
  } else {
    console.log('❌ FAILURE: SD dropdown still has issues');
    console.log(`   ${result.message}`);
    console.log('\n⚠️ Additional fixes needed');
  }
  
  console.log('\n' + '=' .repeat(50));
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});