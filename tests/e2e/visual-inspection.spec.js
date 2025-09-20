/**
 * LEO Protocol v4.1 - Visual Inspection Test Suite
 * Enables visual inspection during test requirement development
 */

const { test, expect } = require('@playwright/test');

test.describe('LEO Dashboard Visual Inspection', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for initial load
    await page.waitForLoadState('networkidle');
    
    // Wait for React to hydrate
    await page.waitForTimeout(1000);
  });

  test('Dashboard loads and displays strategic directives', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/LEO Dashboard/);
    
    // Verify main components are visible
    await expect(page.locator('h1')).toContainText('LEO Dashboard');
    
    // Take full page screenshot for visual inspection
    await page.screenshot({ 
      path: 'test-results/screenshots/dashboard-full.png',
      fullPage: true 
    });
    
    // Visual comparison (if baseline exists)
    await expect(page).toHaveScreenshot('dashboard-layout.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('Strategic Directives section visual inspection', async ({ page }) => {
    // Locate SD section
    const sdSection = page.locator('[data-testid="strategic-directives"], .strategic-directives');
    
    if (await sdSection.count() > 0) {
      await expect(sdSection).toBeVisible();
      
      // Screenshot just the SD section
      await sdSection.screenshot({
        path: 'test-results/screenshots/strategic-directives-section.png'
      });
      
      // Check for SD cards/items
      const sdItems = page.locator('[data-testid="sd-item"], .sd-card, .directive-item');
      const itemCount = await sdItems.count();
      
      console.log(`📊 Found ${itemCount} Strategic Directive items`);
      
      // Visual test for SD items
      if (itemCount > 0) {
        await expect(sdItems.first()).toBeVisible();
        await sdItems.first().screenshot({
          path: 'test-results/screenshots/sd-item-sample.png'
        });
      }
    } else {
      console.log('⚠️  No Strategic Directives section found - check component structure');
    }
  });

  test('Navigation and responsive design inspection', async ({ page }) => {
    // Test navigation elements
    const nav = page.locator('nav, .navigation, .navbar');
    if (await nav.count() > 0) {
      await expect(nav).toBeVisible();
      await nav.screenshot({
        path: 'test-results/screenshots/navigation.png'
      });
    }
    
    // Test mobile responsive design
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.screenshot({ 
      path: 'test-results/screenshots/mobile-view.png',
      fullPage: true 
    });
    
    // Test tablet responsive design  
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.screenshot({ 
      path: 'test-results/screenshots/tablet-view.png',
      fullPage: true 
    });
    
    // Reset to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('Interactive elements visual inspection', async ({ page }) => {
    // Find buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      console.log(`🖱️  Found ${buttonCount} interactive buttons`);
      
      // Test button hover states
      await buttons.first().hover();
      await page.screenshot({ 
        path: 'test-results/screenshots/button-hover-state.png' 
      });
      
      // Test button focus states
      await buttons.first().focus();
      await page.screenshot({ 
        path: 'test-results/screenshots/button-focus-state.png' 
      });
    }
    
    // Find form inputs
    const inputs = page.locator('input, textarea, select');
    const inputCount = await inputs.count();
    
    if (inputCount > 0) {
      console.log(`📝 Found ${inputCount} form inputs`);
      
      // Test input focus states
      await inputs.first().focus();
      await page.screenshot({ 
        path: 'test-results/screenshots/input-focus-state.png' 
      });
    }
  });

  test('Error states and loading visual inspection', async ({ page }) => {
    // Test loading states by intercepting network requests
    await page.route('**/api/**', route => {
      // Delay API responses to capture loading states
      setTimeout(() => route.continue(), 2000);
    });
    
    // Reload page to trigger loading
    await page.reload();
    
    // Capture loading state
    await page.screenshot({ 
      path: 'test-results/screenshots/loading-state.png',
      fullPage: true 
    });
    
    // Wait for loading to complete
    await page.waitForLoadState('networkidle');
    
    // Test 404/error page (if route exists)
    try {
      await page.goto('/non-existent-page');
      await page.screenshot({ 
        path: 'test-results/screenshots/404-error-page.png',
        fullPage: true 
      });
    } catch (error) {
      console.log('📝 No custom 404 page detected');
    }
  });
  
});

test.describe('LEO Protocol Compliance Visual Tests', () => {
  
  test('Progress indicators visual inspection', async ({ page }) => {
    await page.goto('/');
    
    // Look for progress bars, percentages, or status indicators
    const progressElements = page.locator(
      '.progress, .progress-bar, [data-testid*="progress"], .status-indicator, .completion-rate'
    );
    
    const progressCount = await progressElements.count();
    if (progressCount > 0) {
      console.log(`📊 Found ${progressCount} progress indicators`);
      
      for (let i = 0; i < Math.min(progressCount, 3); i++) {
        await progressElements.nth(i).screenshot({
          path: `test-results/screenshots/progress-indicator-${i + 1}.png`
        });
      }
    }
  });

  test('Status labels visual inspection', async ({ page }) => {
    await page.goto('/');
    
    // Look for LEO Protocol status labels
    const statusElements = page.locator(
      '.status, .badge, [data-testid*="status"], [class*="status"]'
    );
    
    const statusCount = await statusElements.count();
    if (statusCount > 0) {
      console.log(`🏷️  Found ${statusCount} status elements`);
      
      // Capture different status types
      for (let i = 0; i < Math.min(statusCount, 5); i++) {
        const element = statusElements.nth(i);
        const text = await element.textContent();
        
        await element.screenshot({
          path: `test-results/screenshots/status-${text?.replace(/[^a-zA-Z0-9]/g, '-') || i}.png`
        });
      }
    }
  });
  
});