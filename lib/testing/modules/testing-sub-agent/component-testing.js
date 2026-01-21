#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Component Testing Module
 * Handles testing of specific UI components
 */

import path from 'path';

/**
 * Test specific component by finding it using selectors
 * @param {object} page - Playwright page object
 * @param {object} target - Test target configuration
 * @param {object} config - Test configuration
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function testComponent(page, target, config, testResults) {
  const componentName = target.name.toLowerCase().replace(/\s+/g, '-');

  // Try to find component using provided selectors
  const component = await findComponentBySelectors(page, target);

  if (component) {
    // Component found - capture it
    const componentScreenshot = `${componentName}-component.png`;
    await component.screenshot({
      path: path.join(config.screenshotDir, componentScreenshot)
    });
    testResults.screenshots.push(componentScreenshot);

    // Test component interactivity if applicable
    await testComponentInteractivity(page, component, target, config, testResults);
  } else {
    // Component not found - capture evidence
    const notFoundScreenshot = `${componentName}-not-found.png`;
    await page.screenshot({
      path: path.join(config.screenshotDir, notFoundScreenshot),
      fullPage: true
    });

    testResults.warnings++;
    testResults.issues.push({
      target: target.name,
      issue: 'Component not found with provided selectors',
      selectors: target.selectors,
      type: 'warning'
    });
  }
}

/**
 * Find component by trying multiple selectors
 * @param {object} page - Playwright page object
 * @param {object} target - Test target configuration
 * @returns {Promise<object|null>}
 */
async function findComponentBySelectors(page, target) {
  for (const selector of target.selectors || []) {
    try {
      const elements = await page.locator(selector);
      const count = await elements.count();

      if (count > 0) {
        console.log(`Found ${target.name} using selector: ${selector}`);
        return elements.first();
      }
    } catch (_error) {
      // Continue trying other selectors
    }
  }
  return null;
}

/**
 * Test component interactivity (hover, focus states)
 * @param {object} page - Playwright page object
 * @param {object} component - Component locator
 * @param {object} target - Test target configuration
 * @param {object} config - Test configuration
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function testComponentInteractivity(page, component, target, config, testResults) {
  const componentName = target.name.toLowerCase().replace(/\s+/g, '-');

  try {
    // Check if component is interactive
    const isClickable = await component.evaluate(el => {
      return el.tagName === 'BUTTON' ||
             el.tagName === 'A' ||
             el.onclick !== null ||
             el.style.cursor === 'pointer' ||
             el.getAttribute('role') === 'button';
    });

    if (isClickable) {
      // Test hover state
      await component.hover();
      await page.waitForTimeout(300);

      const hoverScreenshot = `${componentName}-hover-state.png`;
      await component.screenshot({
        path: path.join(config.screenshotDir, hoverScreenshot)
      });
      testResults.screenshots.push(hoverScreenshot);

      // Test focus state
      await component.focus();
      await page.waitForTimeout(300);

      const focusScreenshot = `${componentName}-focus-state.png`;
      await component.screenshot({
        path: path.join(config.screenshotDir, focusScreenshot)
      });
      testResults.screenshots.push(focusScreenshot);
    }
  } catch (error) {
    // Non-critical - log but do not fail
    console.log(`Could not test interactivity for ${target.name}: ${error.message}`);
  }
}

export {
  testComponent,
  findComponentBySelectors,
  testComponentInteractivity
};
