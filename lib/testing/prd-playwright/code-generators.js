/**
 * PRD Playwright Generator - Code Generation Helpers
 */

export function generateTestStepCode(steps) {
  if (!steps || steps.length === 0) return '    // No test steps defined';

  return steps.map(step => {
    switch (step.action) {
      case 'navigate':
        return `    await page.goto('${step.target}');`;
      case 'click':
        return `    await page.click('${step.target}');`;
      case 'fill':
        return `    await page.fill('${step.target}', '${step.data}');`;
      case 'waitForSelector':
        return `    await page.waitForSelector('${step.target}', ${JSON.stringify(step.data || {})});`;
      case 'waitForLoadState':
        return `    await page.waitForLoadState('${step.target}');`;
      case 'screenshot':
        return `    await page.screenshot({ path: 'screenshots/${step.data?.name || 'screenshot.png'}', fullPage: ${step.target === 'fullPage'} });`;
      case 'waitForResponse':
        return `    await page.waitForResponse(response => response.url().includes('${step.target}') && response.ok());`;
      default:
        return `    // TODO: Implement ${step.action} for ${step.target}`;
    }
  }).join('\n');
}

export function generateAssertionCode(assertions) {
  if (!assertions || assertions.length === 0) return '    // No assertions defined';

  return assertions.map(assertion => {
    switch (assertion.type) {
      case 'toBeVisible':
        return `    await expect(page.locator('${assertion.selector}')).toBeVisible();`;
      case 'toHaveText':
        return `    await expect(page.locator('${assertion.selector}')).toHaveText(/${assertion.text}/);`;
      case 'toHaveValue':
        return `    await expect(page.locator('${assertion.selector}')).toHaveValue('${assertion.value}');`;
      case 'toBeEnabled':
        return `    await expect(page.locator('${assertion.selector}')).toBeEnabled();`;
      case 'toHaveCount':
        return `    await expect(page.locator('${assertion.selector}')).toHaveCount(${assertion.count});`;
      case 'toHaveScreenshot':
        return `    await expect(page).toHaveScreenshot('${assertion.name}', ${JSON.stringify(assertion.options || {})});`;
      case 'toHaveURL':
        return `    await expect(page).toHaveURL(/${assertion.pattern}/);`;
      default:
        return `    // TODO: Implement assertion ${assertion.type}`;
    }
  }).join('\n');
}

export function generatePreconditionCode(preconditions) {
  if (!preconditions || preconditions.length === 0) {
    return '    // No preconditions';
  }

  return preconditions.map(pre => {
    if (pre.type === 'authentication') {
      return '    // Authenticate user\n    await login(page, fixtures.testUsers.validUser);';
    }
    return `    // ${pre.type}: ${JSON.stringify(pre.data)}`;
  }).join('\n');
}

export function generateCleanupCode(cleanupSteps) {
  if (!cleanupSteps || cleanupSteps.length === 0) {
    return '    // No cleanup required';
  }

  return cleanupSteps.map(step => {
    if (step.action === 'clearStorage') {
      return '    await page.evaluate(() => localStorage.clear());';
    }
    if (step.action === 'clearCookies') {
      return '    await context.clearCookies();';
    }
    return `    // ${step.action}`;
  }).join('\n');
}
