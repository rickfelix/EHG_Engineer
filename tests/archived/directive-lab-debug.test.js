/**
 * DirectiveLab Debug Test
 * ======================
 * Simple test to debug navigation and interface issues
 */

import { test, expect } from '@playwright/test';

test.describe('DirectiveLab Debug', () => {
  test('Debug DirectiveLab Navigation and Interface', async ({ page }) => {
    console.log('🔍 Debug Test: DirectiveLab Navigation');
    
    // Navigate to main page
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    console.log('📄 Current URL:', page.url());
    console.log('📄 Page Title:', await page.title());
    
    // Take screenshot of current state
    await page.screenshot({ 
      path: 'tests/e2e/test-results/debug-initial-state.png',
      fullPage: true
    });
    
    // Look for any navigation elements
    const allButtons = await page.locator('button').count();
    console.log(`🔲 Found ${allButtons} buttons on page`);
    
    // List all button texts
    const buttons = await page.locator('button').all();
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const text = await buttons[i].textContent();
      console.log(`  Button ${i + 1}: "${text}"`);
    }
    
    // Look for DirectiveLab references
    const directiveLabElements = await page.locator('*').filter({
      hasText: /directive/i
    }).count();
    console.log(`📋 Found ${directiveLabElements} elements containing "directive"`);
    
    // Try to find navigation or tabs
    const navElements = await page.locator('nav, [role="tablist"], [role="tab"], .tab, .navigation').count();
    console.log(`🧭 Found ${navElements} navigation elements`);
    
    // Look for any tabs
    const tabs = await page.locator('[role="tab"], .tab, button:has-text("Tab")').all();
    if (tabs.length > 0) {
      console.log('📑 Found tabs:');
      for (let i = 0; i < tabs.length; i++) {
        const text = await tabs[i].textContent();
        console.log(`  Tab ${i + 1}: "${text}"`);
      }
    }
    
    // Look for any form elements that might be the DirectiveLab interface
    const textareas = await page.locator('textarea').count();
    const inputs = await page.locator('input[type="text"], input[type="email"], input:not([type])').count();
    console.log(`📝 Found ${textareas} textareas and ${inputs} text inputs`);
    
    if (textareas > 0) {
      const textarea = page.locator('textarea').first();
      const placeholder = await textarea.getAttribute('placeholder');
      console.log(`📝 First textarea placeholder: "${placeholder}"`);
    }
    
    // Try different ways to find DirectiveLab
    const directiveLabSelectors = [
      'button:has-text("DirectiveLab")',
      'button:has-text("Directive Lab")',
      'button:has-text("Directive")',
      '[data-testid="directive-lab"]',
      'text=DirectiveLab',
      '.directive-lab',
      '*:has-text("DirectiveLab")'
    ];
    
    for (const selector of directiveLabSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`✅ Found DirectiveLab element with selector: ${selector} (${count} matches)`);
        const text = await page.locator(selector).first().textContent();
        console.log(`   Text content: "${text}"`);
      }
    }
    
    // Check page source for any DirectiveLab references
    const pageContent = await page.content();
    const directiveLabReferences = (pageContent.match(/directive.lab/gi) || []).length;
    console.log(`📋 Page source contains ${directiveLabReferences} "DirectiveLab" references`);
    
    // Try to navigate to dashboard specifically
    try {
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForLoadState('networkidle');
      console.log('🎯 Successfully navigated to /dashboard');
      
      await page.screenshot({ 
        path: 'tests/e2e/test-results/debug-dashboard-state.png',
        fullPage: true
      });
      
      // Look again for DirectiveLab on dashboard
      const dashboardButtons = await page.locator('button').count();
      console.log(`🔲 Dashboard has ${dashboardButtons} buttons`);
      
      const dashboardButtonTexts = await page.locator('button').allTextContents();
      console.log('🔲 Dashboard buttons:', dashboardButtonTexts.slice(0, 10));
      
    } catch (error) {
      console.log('❌ Failed to navigate to dashboard:', error.message);
    }
    
    // Final attempt - look for any components that might contain DirectiveLab
    const components = await page.locator('[class*="component"], [class*="Component"], [data-component]').count();
    console.log(`🧩 Found ${components} potential component elements`);
    
    console.log('🔍 Debug test completed. Check screenshots for visual state.');
  });
  
  test('Test Available Interface Elements', async ({ page }) => {
    console.log('🧪 Testing Available Interface Elements');
    
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Try clicking the first few buttons to see what happens
    const buttons = await page.locator('button').all();
    
    for (let i = 0; i < Math.min(buttons.length, 3); i++) {
      try {
        const text = await buttons[i].textContent();
        console.log(`🔘 Attempting to click button: "${text}"`);
        
        await buttons[i].click();
        await page.waitForTimeout(1000);
        
        // Check if URL changed or new content appeared
        console.log(`   URL after click: ${page.url()}`);
        
        const newContent = await page.locator('h1, h2, h3, [role="heading"]').allTextContents();
        console.log(`   Page headings: ${newContent.slice(0, 3).join(', ')}`);
        
        // Take screenshot after each click
        await page.screenshot({ 
          path: `tests/e2e/test-results/debug-after-click-${i + 1}.png`,
          fullPage: false,
          clip: { x: 0, y: 0, width: 1200, height: 800 }
        });
        
        // Check for textarea or input fields that might have appeared
        const textareas = await page.locator('textarea').count();
        if (textareas > 0) {
          console.log(`   ✅ Found ${textareas} textarea(s) after click - might be DirectiveLab!`);
          break;
        }
        
      } catch (error) {
        console.log(`   ❌ Error clicking button ${i + 1}:`, error.message);
      }
    }
  });
});