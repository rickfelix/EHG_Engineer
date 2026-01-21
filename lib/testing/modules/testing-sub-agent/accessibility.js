#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Accessibility Testing Module
 * Handles basic accessibility checks for UI components
 */

/**
 * Perform basic accessibility checks on the page
 * @param {object} page - Playwright page object
 * @param {object} target - Test target configuration
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function checkBasicAccessibility(page, target, testResults) {
  try {
    const accessibilityIssues = await collectAccessibilityIssues(page);

    if (accessibilityIssues.length > 0) {
      testResults.issues.push({
        target: target.name,
        type: 'accessibility',
        issues: accessibilityIssues
      });
    }

    console.log(`Accessibility check completed for ${target.name}`);

  } catch (error) {
    console.log(`Accessibility check failed for ${target.name}: ${error.message}`);
  }
}

/**
 * Collect accessibility issues from the page
 * @param {object} page - Playwright page object
 * @returns {Promise<Array<string>>}
 */
async function collectAccessibilityIssues(page) {
  return page.evaluate(() => {
    const issues = [];

    // Check for missing alt text on images
    const images = document.querySelectorAll('img');
    images.forEach((img, index) => {
      if (!img.alt && !img.getAttribute('aria-label')) {
        issues.push(`Image ${index + 1} missing alt text`);
      }
    });

    // Check for buttons without accessible names
    const buttons = document.querySelectorAll('button');
    buttons.forEach((btn, index) => {
      const hasText = btn.textContent.trim();
      const hasAriaLabel = btn.getAttribute('aria-label');
      const hasAriaLabelledBy = btn.getAttribute('aria-labelledby');

      if (!hasText && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push(`Button ${index + 1} has no accessible name`);
      }
    });

    // Check for form inputs without labels
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
    inputs.forEach((input, index) => {
      const hasLabel = input.labels?.length > 0 ||
                      input.getAttribute('aria-label') ||
                      input.getAttribute('aria-labelledby');
      if (!hasLabel) {
        issues.push(`Input ${index + 1} has no associated label`);
      }
    });

    return issues;
  });
}

/**
 * Check image accessibility
 * @param {object} page - Playwright page object
 * @returns {Promise<Array<string>>}
 */
async function checkImageAccessibility(page) {
  return page.evaluate(() => {
    const issues = [];
    const images = document.querySelectorAll('img');

    images.forEach((img, index) => {
      if (!img.alt && !img.getAttribute('aria-label')) {
        issues.push(`Image ${index + 1} missing alt text`);
      }
    });

    return issues;
  });
}

/**
 * Check button accessibility
 * @param {object} page - Playwright page object
 * @returns {Promise<Array<string>>}
 */
async function checkButtonAccessibility(page) {
  return page.evaluate(() => {
    const issues = [];
    const buttons = document.querySelectorAll('button');

    buttons.forEach((btn, index) => {
      const hasText = btn.textContent.trim();
      const hasAriaLabel = btn.getAttribute('aria-label');
      const hasAriaLabelledBy = btn.getAttribute('aria-labelledby');

      if (!hasText && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push(`Button ${index + 1} has no accessible name`);
      }
    });

    return issues;
  });
}

/**
 * Check form input accessibility
 * @param {object} page - Playwright page object
 * @returns {Promise<Array<string>>}
 */
async function checkInputAccessibility(page) {
  return page.evaluate(() => {
    const issues = [];
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');

    inputs.forEach((input, index) => {
      const hasLabel = input.labels?.length > 0 ||
                      input.getAttribute('aria-label') ||
                      input.getAttribute('aria-labelledby');
      if (!hasLabel) {
        issues.push(`Input ${index + 1} has no associated label`);
      }
    });

    return issues;
  });
}

export {
  checkBasicAccessibility,
  collectAccessibilityIssues,
  checkImageAccessibility,
  checkButtonAccessibility,
  checkInputAccessibility
};
