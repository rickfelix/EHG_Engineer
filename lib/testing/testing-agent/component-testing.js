/**
 * Component Testing
 * Test specific components and their interactivity
 */

import path from 'path';

/**
 * Test specific components
 */
export async function testComponent(page, target, config, testResults) {
  const componentName = target.name.toLowerCase().replace(/\s+/g, '-');

  let component = null;

  for (const selector of target.selectors || []) {
    try {
      const elements = await page.locator(selector);
      const count = await elements.count();

      if (count > 0) {
        component = elements.first();
        console.log(`\u{1F4CD} Found ${target.name} using selector: ${selector}`);
        break;
      }
    } catch (_error) {
      // Continue trying other selectors
    }
  }

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
 * Test component interactivity
 */
export async function testComponentInteractivity(page, component, target, config, testResults) {
  const componentName = target.name.toLowerCase().replace(/\s+/g, '-');

  try {
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
    console.log(`\u2139\uFE0F  Could not test interactivity for ${target.name}: ${error.message}`);
  }
}
