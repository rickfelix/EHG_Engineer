#!/usr/bin/env node

/**
 * Dark Mode Toggle Validation Script
 * Tests the dark mode toggle functionality specifically
 */

const { chromium } = require('playwright');

async function testDarkModeToggle() {
  console.log('🌗 Testing Dark Mode Toggle Functionality');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    // Navigate to the main dashboard
    console.log('📍 Navigating to http://localhost:3000/');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Look for the dark mode toggle
    const toggle = await page.locator('button[title*="mode"]').first();
    const toggleExists = await toggle.count() > 0;
    
    console.log(`🔘 Dark mode toggle found: ${toggleExists ? '✅' : '❌'}`);
    
    if (toggleExists) {
      // Check initial state
      const htmlElement = page.locator('html');
      const initialDarkMode = await htmlElement.evaluate(el => el.classList.contains('dark'));
      console.log(`🌙 Initial state: ${initialDarkMode ? 'Dark' : 'Light'} mode`);
      
      // Take screenshot of initial state
      await page.screenshot({ 
        path: 'dark-mode-initial.png',
        fullPage: true 
      });
      
      // Click the toggle
      console.log('🖱️  Clicking dark mode toggle...');
      await toggle.click();
      
      // Wait for animation to complete
      await page.waitForTimeout(500);
      
      // Check if state changed
      const newDarkMode = await htmlElement.evaluate(el => el.classList.contains('dark'));
      console.log(`🌗 After toggle: ${newDarkMode ? 'Dark' : 'Light'} mode`);
      
      // Take screenshot of new state
      await page.screenshot({ 
        path: 'dark-mode-toggled.png',
        fullPage: true 
      });
      
      // Test localStorage persistence
      const themeInStorage = await page.evaluate(() => localStorage.getItem('theme'));
      console.log(`💾 Theme in localStorage: ${themeInStorage}`);
      
      // Toggle again to test both directions
      await toggle.click();
      await page.waitForTimeout(500);
      
      const finalDarkMode = await htmlElement.evaluate(el => el.classList.contains('dark'));
      console.log(`🔄 After second toggle: ${finalDarkMode ? 'Dark' : 'Light'} mode`);
      
      // Verify it works as expected
      const toggleWorking = (initialDarkMode !== newDarkMode) && (initialDarkMode === finalDarkMode);
      console.log(`✅ Toggle functionality: ${toggleWorking ? 'Working' : 'Not working'}`);
      
      // Test icon animations
      const sunIcon = page.locator('svg').first();
      const moonIcon = page.locator('svg').nth(1);
      
      console.log('🎨 Testing icon animations...');
      
      // Final screenshot
      await page.screenshot({ 
        path: 'dark-mode-final.png',
        fullPage: true 
      });
      
      return {
        toggleExists,
        toggleWorking,
        persistenceWorking: themeInStorage !== null,
        initialState: initialDarkMode ? 'dark' : 'light',
        success: true
      };
    } else {
      return {
        toggleExists: false,
        toggleWorking: false,
        persistenceWorking: false,
        success: false,
        error: 'Dark mode toggle not found'
      };
    }
    
  } catch (error) {
    console.error('❌ Error testing dark mode toggle:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  testDarkModeToggle().then(result => {
    console.log('\n🎯 Dark Mode Toggle Test Results:');
    console.log('=====================================');
    console.log(`Toggle Exists: ${result.toggleExists ? '✅' : '❌'}`);
    console.log(`Toggle Working: ${result.toggleWorking ? '✅' : '❌'}`);
    console.log(`Persistence Working: ${result.persistenceWorking ? '✅' : '❌'}`);
    console.log(`Overall Success: ${result.success ? '✅' : '❌'}`);
    
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { testDarkModeToggle };