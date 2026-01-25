/**
 * Markdown Report Generator for LEO Protocol Summary
 *
 * Generates detailed markdown reports saved to docs/summaries/compliance/
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getScoreStatus } from './compliance-scorer.js';
import { calculateTiming } from './sd-aggregator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, '../../../docs/summaries/compliance');

/**
 * Format date for markdown
 */
function formatDate(isoDate) {
  if (!isoDate) return 'N/A';
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format duration in minutes
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Get grade color/emoji
 */
function gradeEmoji(grade) {
  const emojis = { A: '🟢', B: '🔵', C: '🟡', D: '🟠', F: '🔴' };
  return emojis[grade] || '⚪';
}

/**
 * Generate markdown report content
 * @param {Object} sd - Strategic Directive
 * @param {Object} data - Aggregated data
 * @param {Object} scores - Compliance scores
 * @returns {string} Markdown content
 */
function generateMarkdownContent(sd, data, scores) {
  const timing = calculateTiming(sd, data.timeline);
  const now = new Date().toISOString();

  let md = `# LEO Protocol Compliance Summary

**Generated**: ${formatDate(now)}

---

## Strategic Directive

| Field | Value |
|-------|-------|
| **ID** | ${sd.id} |
| **Title** | ${sd.title} |
| **Type** | ${sd.sd_type || 'feature'} |
| **Status** | ${sd.status} |
| **Category** | ${sd.category || 'N/A'} |
| **Priority** | ${sd.priority || 'N/A'} |

---

## Timing

| Metric | Value |
|--------|-------|
| **Started** | ${formatDate(timing.startDate)} |
| **Completed** | ${formatDate(timing.endDate)} |
| **Total Duration** | ${timing.totalFormatted} (${timing.totalMinutes} min) |

`;

  // Phase breakdown
  if (timing.phases.length > 0) {
    md += `### Phase Breakdown

| Phase | Duration | Started | Completed |
|-------|----------|---------|-----------|
`;
    for (const phase of timing.phases) {
      md += `| ${phase.phase} | ${formatDuration(phase.durationMinutes)} | ${formatDate(phase.started)} | ${formatDate(phase.completed)} |\n`;
    }
    md += '\n';
  }

  // Overall Score
  md += `---

## Overall Compliance Score

${gradeEmoji(scores.grade)} **${scores.overall}%** (Grade: **${scores.grade}**)

`;

  // Dimension Breakdown
  md += `### Dimension Breakdown

| Dimension | Weight | Score | Status |
|-----------|--------|-------|--------|
| Handoff Completeness | 25% | ${scores.dimensions.handoffCompleteness.score}% | ${getScoreStatus(scores.dimensions.handoffCompleteness.score)} |
| Handoff Quality | 25% | ${scores.dimensions.handoffQuality.score}% | ${getScoreStatus(scores.dimensions.handoffQuality.score)} |
| Gate Compliance | 25% | ${scores.dimensions.gateCompliance.score}% | ${getScoreStatus(scores.dimensions.gateCompliance.score)} |
| Sequence Compliance | 15% | ${scores.dimensions.sequenceCompliance.score}% | ${getScoreStatus(scores.dimensions.sequenceCompliance.score)} |
| Duration Efficiency | 10% | ${scores.dimensions.durationEfficiency.score}% | ${getScoreStatus(scores.dimensions.durationEfficiency.score)} |

`;

  // Handoff Summary
  const acceptedHandoffs = data.handoffs.filter(h => h.status === 'accepted');
  const pendingHandoffs = data.handoffs.filter(h => h.status === 'pending');

  md += `---

## Handoff Summary

- **Total Handoffs**: ${data.handoffs.length}${data.isOrchestrator ? ` (across ${data.children.length + 1} SDs)` : ''}
- **Accepted**: ${acceptedHandoffs.length}
- **Pending**: ${pendingHandoffs.length}

### Handoff Details

| Type | SD | Status | Validation Score | Created |
|------|-----|--------|------------------|---------|
`;

  for (const h of data.handoffs) {
    md += `| ${h.handoff_type} | ${h.sd_id} | ${h.status} | ${h.validation_score || 'N/A'} | ${formatDate(h.created_at)} |\n`;
  }

  md += '\n';

  // Children summary for orchestrators
  if (data.isOrchestrator && data.children.length > 0) {
    md += `---

## Child Strategic Directives

| ID | Title | Type | Status | Handoffs |
|----|-------|------|--------|----------|
`;
    for (const child of data.children) {
      const childAccepted = child.handoffs.filter(h => h.status === 'accepted').length;
      md += `| ${child.sd.id} | ${child.sd.title} | ${child.sd.sd_type || 'feature'} | ${child.sd.status} | ${childAccepted} |\n`;
    }
    md += '\n';
  }

  // Gate Compliance Details
  const gateDetails = scores.dimensions.gateCompliance.details;
  if (gateDetails.checks && gateDetails.checks.length > 0) {
    md += `---

## Gate Compliance Checks

| Check | Passed | Value |
|-------|--------|-------|
`;
    for (const check of gateDetails.checks) {
      const icon = check.passed ? '✅' : '❌';
      md += `| ${check.name} | ${icon} | ${check.value} |\n`;
    }
    md += '\n';
  }

  // Duration Analysis
  const durDetails = scores.dimensions.durationEfficiency.details;
  if (durDetails.actualHours !== undefined) {
    md += `---

## Duration Analysis

| Metric | Value |
|--------|-------|
| Actual Duration | ${durDetails.actualHours} hours |
| Expected Duration | ${durDetails.expectedHours} hours |
| SD Type | ${durDetails.sdType} |
| Ratio | ${durDetails.ratio}x |

`;
  }

  // Recommendations
  md += `---

## Recommendations

`;

  const recommendations = [];

  if (scores.dimensions.handoffCompleteness.score < 100) {
    recommendations.push('- **Handoff Completeness**: Ensure all required handoffs are created for each phase transition');
  }
  if (scores.dimensions.handoffQuality.score < 85) {
    recommendations.push('- **Handoff Quality**: Fill in all 7 mandatory elements (executive_summary, deliverables_manifest, key_decisions, known_issues, resource_utilization, action_items, completeness_report)');
  }
  if (scores.dimensions.gateCompliance.score < 85) {
    recommendations.push('- **Gate Compliance**: Ensure validation scores meet 85% threshold and PRD is approved before proceeding');
  }
  if (scores.dimensions.sequenceCompliance.score < 100) {
    recommendations.push('- **Sequence Compliance**: Follow the standard handoff sequence: LEAD→PLAN→EXEC→VERIFY');
  }
  if (scores.dimensions.durationEfficiency.score < 70) {
    recommendations.push('- **Duration Efficiency**: Review time spent per phase against expected durations for the SD type');
  }

  if (recommendations.length === 0) {
    md += 'No recommendations - excellent LEO Protocol compliance! 🎉\n';
  } else {
    md += recommendations.join('\n') + '\n';
  }

  md += `
---

*Report generated by LEO Protocol Summary Generator*
`;

  return md;
}

/**
 * Generate and save markdown report
 * @param {Object} sd - Strategic Directive
 * @param {Object} data - Aggregated data
 * @param {Object} scores - Compliance scores
 * @returns {Promise<string>} Path to saved report
 */
export async function generateMarkdownReport(sd, data, scores) {
  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Generate filename
  const date = new Date().toISOString().split('T')[0];
  const filename = `${date}-${sd.id}-compliance-summary.md`;
  const filepath = join(OUTPUT_DIR, filename);

  // Generate content
  const content = generateMarkdownContent(sd, data, scores);

  // Write file
  await writeFile(filepath, content, 'utf-8');

  return filepath;
}
