/**
 * Report Generator
 * Generate HTML and JSON test reports
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Generate comprehensive automated report
 */
export async function generateAutomatedReport(testResults, config) {
  console.log('\u{1F4CA} Generating automated test report...');

  const report = {
    timestamp: new Date().toISOString(),
    protocol: 'LEO v4.1',
    testType: 'Automated Visual Inspection',
    summary: {
      totalTests: testResults.passed + testResults.failed,
      passed: testResults.passed,
      failed: testResults.failed,
      warnings: testResults.warnings,
      successRate: testResults.passed / (testResults.passed + testResults.failed) * 100
    },
    screenshots: testResults.screenshots,
    issues: testResults.issues,
    recommendations: generateRecommendations(testResults)
  };

  // Save JSON report
  const reportPath = path.join(config.reportDir, 'automated-test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  // Generate HTML report
  const htmlReport = generateHTMLReport(report, config);
  const htmlPath = path.join(config.reportDir, 'automated-test-report.html');
  await fs.writeFile(htmlPath, htmlReport);

  console.log('\u{1F4CB} Reports generated:');
  console.log(`   JSON: ${reportPath}`);
  console.log(`   HTML: ${htmlPath}`);

  // Output summary to console
  console.log('\n\u{1F3AF} Test Summary:');
  console.log(`   Passed: ${report.summary.passed}`);
  console.log(`   Failed: ${report.summary.failed}`);
  console.log(`   Warnings: ${report.summary.warnings}`);
  console.log(`   Success Rate: ${report.summary.successRate.toFixed(1)}%`);
  console.log(`   Screenshots: ${report.screenshots.length}`);
}

/**
 * Generate automated recommendations
 */
export function generateRecommendations(testResults) {
  const recommendations = [];

  if (testResults.failed > 0) {
    recommendations.push({
      type: 'critical',
      message: `${testResults.failed} tests failed. Review error screenshots and fix critical issues before deployment.`
    });
  }

  const performanceIssues = testResults.issues.filter(issue => issue.type === 'performance');
  if (performanceIssues.length > 0) {
    recommendations.push({
      type: 'performance',
      message: 'Performance issues detected. Consider optimizing load times and resource usage.'
    });
  }

  const accessibilityIssues = testResults.issues.filter(issue => issue.type === 'accessibility');
  if (accessibilityIssues.length > 0) {
    recommendations.push({
      type: 'accessibility',
      message: 'Accessibility improvements needed. Add missing alt text, labels, and ARIA attributes.'
    });
  }

  if (testResults.warnings > 0) {
    recommendations.push({
      type: 'warning',
      message: `${testResults.warnings} warnings detected. Review component structure and selectors.`
    });
  }

  return recommendations;
}

/**
 * Generate HTML report
 */
export function generateHTMLReport(report, config) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>LEO Protocol v4.1 - Automated Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .metric { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff; }
        .metric.success { border-left-color: #28a745; }
        .metric.danger { border-left-color: #dc3545; }
        .metric.warning { border-left-color: #ffc107; }
        .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
        .screenshot { background: white; padding: 10px; border-radius: 6px; border: 1px solid #dee2e6; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 6px; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="header">
        <h1>\u{1F916} LEO Protocol v4.1 - Automated Testing Report</h1>
        <p><strong>Generated:</strong> ${report.timestamp}</p>
        <p><strong>Test Type:</strong> ${report.testType}</p>
    </div>

    <h2>\u{1F4CA} Summary</h2>
    <div class="summary">
        <div class="metric success">
            <h3>Passed</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.passed}</p>
        </div>
        <div class="metric ${report.summary.failed > 0 ? 'danger' : 'success'}">
            <h3>Failed</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.failed}</p>
        </div>
        <div class="metric ${report.summary.warnings > 0 ? 'warning' : 'success'}">
            <h3>Warnings</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.warnings}</p>
        </div>
        <div class="metric">
            <h3>Success Rate</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.successRate.toFixed(1)}%</p>
        </div>
    </div>

    ${report.recommendations.length > 0 ? `
    <h2>\u{1F4A1} Recommendations</h2>
    <div class="recommendations">
        ${report.recommendations.map(rec => `<p><strong>${rec.type.toUpperCase()}:</strong> ${rec.message}</p>`).join('')}
    </div>
    ` : ''}

    <h2>\u{1F4F8} Screenshots (${report.screenshots.length})</h2>
    <p>Screenshots saved to: <code>${config.screenshotDir}</code></p>

    <h2>\u{1F50D} Issues (${report.issues.length})</h2>
    ${report.issues.length > 0 ? `
        ${report.issues.map(issue => `
            <div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 6px;">
                <h4>${issue.target} - ${issue.type || 'Error'}</h4>
                <p>${issue.error || issue.issue || JSON.stringify(issue.issues)}</p>
            </div>
        `).join('')}
    ` : '<p>No issues detected! \u2705</p>'}

    <footer style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 6px;">
        <p><small>Generated by LEO Protocol v4.1 Automated Testing Sub-Agent</small></p>
    </footer>
</body>
</html>`;
}
