/**
 * Theme Switching Performance Test
 * Verifies that theme switching meets <300ms requirement
 */

import { chromium } from 'playwright';

async function testThemePerformance() {
  console.log('🎨 Theme Switching Performance Test\n');
  console.log('=' .repeat(50));
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Navigate to DirectiveLab (chairman page)
    await page.goto('http://localhost:3000/directive-lab');
    await page.waitForLoadState('networkidle');
    
    // Find the DarkModeToggle button
    const toggle = await page.locator('button[aria-label*="mode"]').first();
    
    if (await toggle.count() === 0) {
      console.log('❌ DarkModeToggle not found on page');
      return false;
    }
    
    console.log('✅ DarkModeToggle found on DirectiveLab page');
    
    // Test theme switching performance
    const measurements = [];
    
    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      
      // Click toggle
      await toggle.click();
      
      // Wait for theme class to change
      await page.waitForFunction(() => {
        const html = document.documentElement;
        return html.classList.contains('dark') || html.classList.contains('light');
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      measurements.push(duration);
      
      console.log(`  Test ${i + 1}: ${duration}ms`);
      
      // Small delay between tests
      await page.waitForTimeout(500);
    }
    
    // Calculate average
    const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    
    console.log('\n📊 Performance Results:');
    console.log(`  Average switch time: ${avgTime.toFixed(2)}ms`);
    console.log(`  Target: <300ms`);
    console.log(`  Result: ${avgTime < 300 ? '✅ PASS' : '❌ FAIL'}`);
    
    // Check placement (LEFT of title)
    const headerLayout = await page.evaluate(() => {
      const toggle = document.querySelector('button[aria-label*="mode"]');
      const title = document.querySelector('h1');
      
      if (!toggle || !title) return null;
      
      const toggleRect = toggle.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      
      return {
        toggleLeft: toggleRect.left,
        toggleRight: toggleRect.right,
        titleLeft: titleRect.left,
        isLeftOfTitle: toggleRect.right < titleRect.left
      };
    });
    
    if (headerLayout) {
      console.log('\n📍 Placement Verification:');
      console.log(`  Toggle position: ${headerLayout.toggleLeft}px from left`);
      console.log(`  Title position: ${headerLayout.titleLeft}px from left`);
      console.log(`  Is LEFT of title: ${headerLayout.isLeftOfTitle ? '✅ YES' : '❌ NO'}`);
    }
    
    // Check localStorage persistence
    const currentTheme = await page.evaluate(() => localStorage.getItem('theme'));
    console.log(`\n💾 Theme persistence: ${currentTheme ? '✅ Saved in localStorage' : '❌ Not saved'}`);
    
    // Test accessibility
    const accessibilityCheck = await page.evaluate(() => {
      const toggle = document.querySelector('button[aria-label*="mode"]');
      return {
        hasAriaLabel: !!toggle?.getAttribute('aria-label'),
        hasTitle: !!toggle?.getAttribute('title'),
        isFocusable: toggle?.tabIndex >= 0
      };
    });
    
    console.log('\n♿ Accessibility Check:');
    console.log(`  Has aria-label: ${accessibilityCheck.hasAriaLabel ? '✅' : '❌'}`);
    console.log(`  Has title: ${accessibilityCheck.hasTitle ? '✅' : '❌'}`);
    console.log(`  Is focusable: ${accessibilityCheck.isFocusable ? '✅' : '❌'}`);
    
    return avgTime < 300 && headerLayout?.isLeftOfTitle;
    
  } catch (error) {
    console.error('Test failed:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

// Run test
testThemePerformance().then(success => {
  console.log('\n' + '='.repeat(50));
  console.log(success ? '✅ ALL TESTS PASSED' : '❌ TESTS FAILED');
  process.exit(success ? 0 : 1);
});