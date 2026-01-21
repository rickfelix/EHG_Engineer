#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Performance Testing Module
 * Handles page performance checking and metrics collection
 */

/**
 * Performance thresholds per LEO Protocol standards
 */
const PERFORMANCE_THRESHOLDS = {
  loadTime: 3000,      // Maximum acceptable page load time (ms)
  domReady: 2000,      // Maximum acceptable DOM ready time (ms)
  firstPaint: 1500     // Maximum acceptable first paint time (ms)
};

/**
 * Check page performance against thresholds
 * @param {object} page - Playwright page object
 * @param {object} target - Test target configuration
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function checkPagePerformance(page, target, testResults) {
  try {
    const metrics = await collectPerformanceMetrics(page);
    const performanceIssues = analyzePerformanceMetrics(metrics);

    if (performanceIssues.length > 0) {
      testResults.issues.push({
        target: target.name,
        type: 'performance',
        issues: performanceIssues,
        metrics
      });
    }

    console.log(`Performance check completed for ${target.name}`);

  } catch (error) {
    console.log(`Performance check failed for ${target.name}: ${error.message}`);
  }
}

/**
 * Collect performance metrics from the page
 * @param {object} page - Playwright page object
 * @returns {Promise<object>}
 */
async function collectPerformanceMetrics(page) {
  return page.evaluate(() => {
    const performance = window.performance;
    const timing = performance.timing;

    return {
      loadTime: timing.loadEventEnd - timing.navigationStart,
      domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
      firstPaint: performance.getEntriesByType('paint')[0]?.startTime || null,
      resourceCount: performance.getEntriesByType('resource').length
    };
  });
}

/**
 * Analyze metrics against thresholds and generate issues
 * @param {object} metrics - Performance metrics object
 * @returns {Array<string>}
 */
function analyzePerformanceMetrics(metrics) {
  const issues = [];

  if (metrics.loadTime > PERFORMANCE_THRESHOLDS.loadTime) {
    issues.push(`Page load time ${metrics.loadTime}ms exceeds ${PERFORMANCE_THRESHOLDS.loadTime}ms threshold`);
  }

  if (metrics.domReady > PERFORMANCE_THRESHOLDS.domReady) {
    issues.push(`DOM ready time ${metrics.domReady}ms exceeds ${PERFORMANCE_THRESHOLDS.domReady}ms threshold`);
  }

  if (metrics.firstPaint && metrics.firstPaint > PERFORMANCE_THRESHOLDS.firstPaint) {
    issues.push(`First paint time ${metrics.firstPaint}ms exceeds ${PERFORMANCE_THRESHOLDS.firstPaint}ms threshold`);
  }

  return issues;
}

export {
  checkPagePerformance,
  collectPerformanceMetrics,
  analyzePerformanceMetrics,
  PERFORMANCE_THRESHOLDS
};
