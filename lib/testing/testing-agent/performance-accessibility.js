/**
 * Performance and Accessibility Checks
 * Automated performance and accessibility validation
 */

import { PERFORMANCE_THRESHOLDS } from './config.js';

/**
 * Check page performance automatically
 */
export async function checkPagePerformance(page, target, testResults) {
  try {
    const metrics = await page.evaluate(() => {
      const performance = window.performance;
      const timing = performance.timing;

      return {
        loadTime: timing.loadEventEnd - timing.navigationStart,
        domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
        firstPaint: performance.getEntriesByType('paint')[0]?.startTime || null,
        resourceCount: performance.getEntriesByType('resource').length
      };
    });

    const performanceIssues = [];

    if (metrics.loadTime > PERFORMANCE_THRESHOLDS.loadTime) {
      performanceIssues.push(`Page load time ${metrics.loadTime}ms exceeds 3s threshold`);
    }

    if (metrics.domReady > PERFORMANCE_THRESHOLDS.domReady) {
      performanceIssues.push(`DOM ready time ${metrics.domReady}ms exceeds 2s threshold`);
    }

    if (performanceIssues.length > 0) {
      testResults.issues.push({
        target: target.name,
        type: 'performance',
        issues: performanceIssues,
        metrics
      });
    }

    console.log(`\u26A1 Performance check completed for ${target.name}`);

  } catch (error) {
    console.log(`\u26A0\uFE0F  Performance check failed for ${target.name}: ${error.message}`);
  }
}

/**
 * Basic accessibility checks
 */
export async function checkBasicAccessibility(page, target, testResults) {
  try {
    const accessibilityIssues = await page.evaluate(() => {
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
        if (!btn.textContent.trim() &&
            !btn.getAttribute('aria-label') &&
            !btn.getAttribute('aria-labelledby')) {
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

    if (accessibilityIssues.length > 0) {
      testResults.issues.push({
        target: target.name,
        type: 'accessibility',
        issues: accessibilityIssues
      });
    }

    console.log(`\u267F Accessibility check completed for ${target.name}`);

  } catch (error) {
    console.log(`\u26A0\uFE0F  Accessibility check failed for ${target.name}: ${error.message}`);
  }
}
