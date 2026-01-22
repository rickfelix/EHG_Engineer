/**
 * Full Page Testing
 * Page-level and responsive testing functionality
 */

import path from 'path';
import { VIEWPORTS } from './config.js';
import { checkPagePerformance, checkBasicAccessibility } from './performance-accessibility.js';

/**
 * Test full page functionality
 */
export async function testFullPage(page, target, config, testResults) {
  const pageName = target.name.toLowerCase().replace(/\s+/g, '-');

  // 1. Basic page load verification
  await page.waitForLoadState('networkidle');

  // 2. Full page screenshot
  const fullScreenshot = `${pageName}-full-page.png`;
  await page.screenshot({
    path: path.join(config.screenshotDir, fullScreenshot),
    fullPage: true
  });
  testResults.screenshots.push(fullScreenshot);

  // 3. Responsive testing - automatically test multiple viewports
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(1000);

    const responsiveScreenshot = `${pageName}-${viewport.name}.png`;
    await page.screenshot({
      path: path.join(config.screenshotDir, responsiveScreenshot),
      fullPage: true
    });
    testResults.screenshots.push(responsiveScreenshot);
  }

  // Reset to standard viewport
  await page.setViewportSize({ width: 1280, height: 720 });

  // 4. Performance check
  await checkPagePerformance(page, target, testResults);

  // 5. Accessibility quick scan
  await checkBasicAccessibility(page, target, testResults);
}

/**
 * Generic test execution for unknown types
 */
export async function testGeneric(page, target, config, testResults) {
  const pageName = target.name.toLowerCase().replace(/\s+/g, '-');

  await page.waitForLoadState('networkidle');

  const screenshot = `${pageName}-generic.png`;
  await page.screenshot({
    path: path.join(config.screenshotDir, screenshot),
    fullPage: true
  });
  testResults.screenshots.push(screenshot);
}
