#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Page Testing Module
 * Handles full page testing including responsive testing
 */

import path from 'path';
import { checkPagePerformance } from './performance.js';
import { checkBasicAccessibility } from './accessibility.js';

/**
 * Standard viewport configurations for responsive testing
 */
const STANDARD_VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 }
];

/**
 * Test full page functionality
 * @param {object} page - Playwright page object
 * @param {object} target - Test target configuration
 * @param {object} config - Test configuration
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function testFullPage(page, target, config, testResults) {
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

  // 3. Responsive testing - test multiple viewports
  await testResponsiveViewports(page, pageName, config, testResults);

  // Reset to standard viewport
  await page.setViewportSize({ width: 1280, height: 720 });

  // 4. Performance check
  await checkPagePerformance(page, target, testResults);

  // 5. Accessibility quick scan
  await checkBasicAccessibility(page, target, testResults);
}

/**
 * Test page across multiple viewport sizes
 * @param {object} page - Playwright page object
 * @param {string} pageName - Normalized page name for screenshots
 * @param {object} config - Test configuration
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function testResponsiveViewports(page, pageName, config, testResults) {
  for (const viewport of STANDARD_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(1000); // Allow layout to adjust

    const responsiveScreenshot = `${pageName}-${viewport.name}.png`;
    await page.screenshot({
      path: path.join(config.screenshotDir, responsiveScreenshot),
      fullPage: true
    });
    testResults.screenshots.push(responsiveScreenshot);
  }
}

/**
 * Test generic target (fallback for unknown types)
 * @param {object} page - Playwright page object
 * @param {object} target - Test target configuration
 * @param {object} config - Test configuration
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function testGeneric(page, target, config, testResults) {
  const targetName = target.name.toLowerCase().replace(/\s+/g, '-');

  // Take a basic screenshot
  const screenshot = `${targetName}-generic.png`;
  await page.screenshot({
    path: path.join(config.screenshotDir, screenshot),
    fullPage: true
  });
  testResults.screenshots.push(screenshot);
}

export {
  testFullPage,
  testResponsiveViewports,
  testGeneric,
  STANDARD_VIEWPORTS
};
