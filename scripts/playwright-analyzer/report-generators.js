/**
 * Report Generators Domain
 * Generates HTML, Markdown, and JSON reports from analysis results
 *
 * @module playwright-analyzer/report-generators
 */

import fs from 'fs/promises';
import { OUTPUT_FILES } from './config.js';

/**
 * Save all report formats
 * @param {Object} results - Complete analysis results
 */
export async function saveReport(results) {
  // Create screenshots directory if it doesn't exist
  await fs.mkdir(OUTPUT_FILES.screenshotDir, { recursive: true });

  // Generate HTML report
  const html = generateHTMLReport(results);
  await fs.writeFile(OUTPUT_FILES.htmlReport, html);

  // Generate JSON report
  await fs.writeFile(OUTPUT_FILES.jsonReport, JSON.stringify(results, null, 2));

  // Generate Markdown summary
  const markdown = generateMarkdownSummary(results);
  await fs.writeFile(OUTPUT_FILES.markdownSummary, markdown);

  console.log('\n📊 Reports saved:');
  console.log(`   - ${OUTPUT_FILES.htmlReport} (visual report)`);
  console.log(`   - ${OUTPUT_FILES.jsonReport} (detailed data)`);
  console.log(`   - ${OUTPUT_FILES.markdownSummary} (action items)`);
  console.log(`   - ${OUTPUT_FILES.screenshotDir}/ (visual comparisons)`);
}

/**
 * Generate HTML report
 * @param {Object} results - Complete analysis results
 * @returns {string} HTML report content
 */
export function generateHTMLReport(results) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Directive Lab UI Analysis</title>
  <style>
    body { font-family: system-ui; margin: 40px; line-height: 1.6; }
    .header { border-bottom: 3px solid #0066cc; padding-bottom: 20px; }
    .section { margin: 40px 0; }
    .priority-high { color: #d32f2f; }
    .priority-medium { color: #f57c00; }
    .priority-low { color: #388e3c; }
    .recommendation { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .actions { margin-left: 20px; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .issue { background: #fff3cd; padding: 10px; margin: 10px 0; border-left: 4px solid #ffc107; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Directive Lab UI Analysis Report</h1>
    <p>Generated: ${results.timestamp}</p>
    <p>URL: ${results.url}</p>
  </div>

  <div class="section">
    <h2>Key Metrics</h2>
    <div class="metric"><strong>Load Time:</strong> ${results.performance.loadTime}ms</div>
    <div class="metric"><strong>Accessibility Violations:</strong> ${results.accessibility.violations?.length || 0}</div>
    <div class="metric"><strong>Color Variants:</strong> ${results.consistency.colors.unique}</div>
    <div class="metric"><strong>Button Variants:</strong> ${results.consistency.components.buttonVariants}</div>
    <div class="metric"><strong>Typography Variants:</strong> ${results.consistency.typography.unique}</div>
  </div>

  <div class="section">
    <h2>Priority Recommendations</h2>
    ${results.recommendations.map(rec => `
      <div class="recommendation">
        <h3 class="priority-${rec.priority.toLowerCase()}">[${rec.priority}] ${rec.title}</h3>
        <p>${rec.description}</p>
        <ul class="actions">
          ${rec.actions.map(action => `<li>${action}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>Responsive Design Issues</h2>
    ${results.responsive.issues.map(issue => `
      <div class="issue">
        <strong>${issue.viewport}:</strong> ${issue.type} - ${issue.fix}
      </div>
    `).join('')}
  </div>
</body>
</html>`;
}

/**
 * Generate Markdown summary report
 * @param {Object} results - Complete analysis results
 * @returns {string} Markdown report content
 */
export function generateMarkdownSummary(results) {
  let md = '# Directive Lab UI/UX Recommendations\n\n';
  md += `**Analysis Date:** ${results.timestamp}\n\n`;

  md += '## Executive Summary\n\n';
  md += 'The Directive Lab interface analysis reveals opportunities to improve the end-to-end user experience, ';
  md += 'visual consistency, and mobile responsiveness. Key focus areas include standardizing the component ';
  md += 'system, improving process flow guidance, and ensuring accessibility compliance.\n\n';

  md += '## Priority Action Items\n\n';

  const highPriority = results.recommendations.filter(r => r.priority === 'HIGH');
  const mediumPriority = results.recommendations.filter(r => r.priority === 'MEDIUM');
  const lowPriority = results.recommendations.filter(r => r.priority === 'LOW');

  if (highPriority.length > 0) {
    md += '### High Priority\n\n';
    highPriority.forEach(rec => {
      md += `#### ${rec.title}\n`;
      md += `*${rec.description}*\n\n`;
      rec.actions.forEach(action => {
        md += `- [ ] ${action}\n`;
      });
      md += '\n';
    });
  }

  if (mediumPriority.length > 0) {
    md += '### Medium Priority\n\n';
    mediumPriority.forEach(rec => {
      md += `#### ${rec.title}\n`;
      md += `*${rec.description}*\n\n`;
      rec.actions.forEach(action => {
        md += `- [ ] ${action}\n`;
      });
      md += '\n';
    });
  }

  if (lowPriority.length > 0) {
    md += '### Low Priority\n\n';
    lowPriority.forEach(rec => {
      md += `#### ${rec.title}\n`;
      md += `*${rec.description}*\n\n`;
      rec.actions.forEach(action => {
        md += `- [ ] ${action}\n`;
      });
      md += '\n';
    });
  }

  md += '## Consistency Metrics\n\n';
  md += `- **Colors Used:** ${results.consistency.colors.unique} (Target: 5-8)\n`;
  md += `- **Button Styles:** ${results.consistency.components.buttonVariants} (Target: 3)\n`;
  md += `- **Input Styles:** ${results.consistency.components.inputVariants} (Target: 2)\n`;
  md += `- **Typography Variants:** ${results.consistency.typography.unique} (Target: 4-6)\n\n`;

  md += '## Implementation Estimates\n\n';
  md += '- **Immediate Fixes (2-4 hours):** Button standardization, form consistency\n';
  md += '- **Short-term (1-2 days):** Mobile navigation, progress indicators\n';
  md += '- **Long-term (3-5 days):** Complete design system implementation, accessibility compliance\n\n';

  md += '## Next Steps\n\n';
  md += '1. Review and prioritize recommendations with stakeholders\n';
  md += '2. Create design system documentation\n';
  md += '3. Implement high-priority fixes\n';
  md += '4. Conduct user testing on improved flows\n';
  md += '5. Monitor performance and accessibility metrics\n';

  return md;
}

export default {
  saveReport,
  generateHTMLReport,
  generateMarkdownSummary
};
