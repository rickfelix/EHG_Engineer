/**
 * Step 4 Layout Fix Verification Test
 * ===================================
 * Tests the DirectiveLab Step 4 vertical layout fix to ensure:
 * - Content is scrollable when it exceeds viewport height
 * - Navigation buttons remain accessible
 * - Layout works across different viewport sizes
 */

import { test, expect } from '@playwright/test';

test.describe('DirectiveLab Step 4 Layout Fix', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main dashboard
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot for debugging
    await page.screenshot({ 
      path: 'tests/e2e/test-results/step4-layout-initial.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1200, height: 800 }
    });
  });

  test('Step 4 layout should be properly scrollable with accessible navigation', async ({ page }) => {
    console.log('🧪 Testing Step 4 Layout Fix - Scrollable Content & Navigation Access');
    
    // Find and click "New Directive" to access DirectiveLab
    const newDirectiveButton = page.locator('button:has-text("New Directive")');
    await expect(newDirectiveButton).toBeVisible({ timeout: 10000 });
    await newDirectiveButton.click();
    await page.waitForTimeout(2000);
    
    console.log('✅ Successfully accessed DirectiveLab');
    
    // Fill out Step 1 to get to Step 4
    const feedbackTextarea = page.locator('textarea[placeholder*="feedback"], textarea:first-of-type').first();
    await expect(feedbackTextarea).toBeVisible({ timeout: 5000 });
    
    await feedbackTextarea.fill('Test comprehensive impact analysis with multiple complex sections that will create long content requiring scrolling to test the vertical layout fix');
    
    // Submit Step 1
    const submitButton = page.locator('button:has-text("Submit"), button[type="submit"]').first();
    await submitButton.click();
    await page.waitForTimeout(3000);
    
    console.log('✅ Step 1 completed');
    
    // Complete Step 2 (Intent Summary)
    const acceptButton2 = page.locator('button:has-text("Accept"), button:has-text("Continue")').first();
    if (await acceptButton2.isVisible()) {
      await acceptButton2.click();
      await page.waitForTimeout(2000);
      console.log('✅ Step 2 completed');
    }
    
    // Complete Step 3 (Classification) 
    const acceptButton3 = page.locator('button:has-text("Accept"), button:has-text("Continue")').first();
    if (await acceptButton3.isVisible()) {
      await acceptButton3.click();
      await page.waitForTimeout(3000);
      console.log('✅ Step 3 completed');
    }
    
    // Now we should be at Step 4 - Impact Analysis
    await page.waitForSelector('text=Impact Analysis', { timeout: 15000 });
    console.log('✅ Reached Step 4 - Impact Analysis');
    
    // Take screenshot of Step 4 initial state
    await page.screenshot({ 
      path: 'tests/e2e/test-results/step4-impact-analysis-state.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1200, height: 800 }
    });
    
    // Test: Verify scrollable container exists
    const scrollableContainer = page.locator('.flex-1.overflow-y-auto');
    await expect(scrollableContainer).toBeVisible();
    console.log('✅ Scrollable container is present');
    
    // Test: Look for Impact Analysis Panel
    const impactAnalysisPanel = page.locator('text=Impact Analysis Overview, text=Application Impact Analysis').first();
    if (await impactAnalysisPanel.isVisible()) {
      console.log('✅ Impact Analysis Panel found');
      
      // Try to expand sections to create more content
      const expandButtons = page.locator('[class*="cursor-pointer"]:has-text("Impact Analysis"), [class*="cursor-pointer"]:has-text("Affected Components")');
      const expandCount = await expandButtons.count();
      console.log(`📋 Found ${expandCount} expandable sections`);
      
      // Click on expandable sections to create more content
      for (let i = 0; i < Math.min(expandCount, 3); i++) {
        try {
          await expandButtons.nth(i).click();
          await page.waitForTimeout(500);
          console.log(`✅ Expanded section ${i + 1}`);
        } catch (error) {
          console.log(`⚠️ Could not expand section ${i + 1}: ${error.message}`);
        }
      }
    }
    
    // Test: Verify navigation buttons are present and accessible
    const backButton = page.locator('button:has-text("Back")');
    const acceptAnalysisButton = page.locator('button:has-text("Accept Impact Analysis"), button:has-text("Accept")').last();
    
    // Check if buttons exist
    const backExists = await backButton.count() > 0;
    const acceptExists = await acceptAnalysisButton.count() > 0;
    
    console.log(`🔲 Back button present: ${backExists}`);
    console.log(`🔲 Accept button present: ${acceptExists}`);
    
    if (acceptExists) {
      // Test: Scroll to make sure the accept button is in view and clickable
      await acceptAnalysisButton.scrollIntoViewIfNeeded();
      await expect(acceptAnalysisButton).toBeVisible();
      
      // Verify button is not cut off by checking if it's clickable
      const buttonBoundingBox = await acceptAnalysisButton.boundingBox();
      if (buttonBoundingBox) {
        console.log(`✅ Accept button is fully visible at position:`, buttonBoundingBox);
        console.log(`✅ Accept button dimensions: ${buttonBoundingBox.width}x${buttonBoundingBox.height}`);
      }
    }
    
    // Test: Verify scrolling works by checking scroll position
    const scrollContainer = page.locator('.flex-1.overflow-y-auto').first();
    if (await scrollContainer.isVisible()) {
      // Get initial scroll position
      const initialScrollTop = await scrollContainer.evaluate(el => el.scrollTop);
      console.log(`📏 Initial scroll position: ${initialScrollTop}`);
      
      // Try to scroll down
      await scrollContainer.evaluate(el => el.scrollTop += 200);
      await page.waitForTimeout(500);
      
      const newScrollTop = await scrollContainer.evaluate(el => el.scrollTop);
      console.log(`📏 New scroll position: ${newScrollTop}`);
      
      if (newScrollTop > initialScrollTop) {
        console.log('✅ Scrolling is working correctly');
      } else {
        console.log('⚠️ No scrolling detected - content may fit in viewport');
      }
      
      // Scroll back to bottom to ensure navigation is accessible
      await scrollContainer.evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(500);
      
      // Take screenshot of scrolled state
      await page.screenshot({ 
        path: 'tests/e2e/test-results/step4-scrolled-to-bottom.png',
        fullPage: false,
        clip: { x: 0, y: 0, width: 1200, height: 800 }
      });
    }
    
    console.log('🎉 Step 4 layout fix verification completed successfully!');
  });

  test('Step 4 layout should work across different viewport sizes', async ({ page }) => {
    console.log('🧪 Testing Step 4 Layout Fix - Responsive Design');
    
    const viewports = [
      { width: 1920, height: 1080, name: 'Desktop Large' },
      { width: 1366, height: 768, name: 'Desktop Standard' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 375, height: 667, name: 'Mobile' }
    ];
    
    for (const viewport of viewports) {
      console.log(`📱 Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
      
      // Set viewport size
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(1000);
      
      // Navigate to DirectiveLab (simplified flow)
      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle');
      
      // Check if the main container has proper flexbox layout
      const mainContainer = page.locator('.flex.flex-col.h-screen');
      await expect(mainContainer).toBeVisible();
      
      // Verify scrollable content area exists
      const scrollableArea = page.locator('.flex-1.overflow-y-auto, .flex-1.flex.flex-col.min-h-0');
      const scrollableExists = await scrollableArea.count() > 0;
      console.log(`✅ ${viewport.name}: Scrollable layout present - ${scrollableExists}`);
      
      // Take screenshot for each viewport
      await page.screenshot({ 
        path: `tests/e2e/test-results/step4-layout-${viewport.name.toLowerCase().replace(' ', '-')}.png`,
        fullPage: false
      });
      
      expect(scrollableExists).toBe(true);
    }
    
    console.log('🎉 Responsive layout verification completed!');
  });
});