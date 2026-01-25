/**
 * Terminal Display for LEO Protocol Summary
 *
 * Renders compliance reports to the terminal with visual progress bars.
 */

import { getScoreStatus } from './compliance-scorer.js';
import { calculateTiming } from './sd-aggregator.js';

const BOX_WIDTH = 70;
const BAR_WIDTH = 30;

/**
 * Create a progress bar
 * @param {number} percent - 0-100
 * @param {number} width - Bar width in characters
 * @returns {string} Progress bar string
 */
function createBar(percent, width = BAR_WIDTH) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';
}

/**
 * Create a horizontal line
 */
function line(char = '-') {
  return char.repeat(BOX_WIDTH);
}

/**
 * Pad string to width
 */
function pad(str, width, padChar = ' ') {
  const s = String(str);
  if (s.length >= width) return s.substring(0, width);
  return s + padChar.repeat(width - s.length);
}

/**
 * Format date for display
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
 * Format duration in minutes to human readable
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
 * Display terminal report
 * @param {Object} sd - Target Strategic Directive
 * @param {Object} data - Aggregated data
 * @param {Object} scores - Compliance scores
 */
export function displayTerminalReport(sd, data, scores) {
  const timing = calculateTiming(sd, data.timeline);

  console.log('\n' + '='.repeat(BOX_WIDTH));
  console.log('SD INFORMATION');
  console.log('='.repeat(BOX_WIDTH));
  console.log();
  console.log(`  ID:       ${sd.id}`);
  console.log(`  Title:    ${sd.title}`);
  console.log(`  Type:     ${sd.sd_type || 'feature'}`);
  console.log(`  Status:   ${sd.status}`);
  console.log(`  Category: ${sd.category || 'N/A'}`);

  // Timing section
  console.log('\n' + line());
  console.log('TIMING');
  console.log(line());
  console.log();
  console.log(`  Started:   ${formatDate(timing.startDate)}`);
  console.log(`  Completed: ${formatDate(timing.endDate)}`);
  console.log(`  Duration:  ${timing.totalFormatted} (${timing.totalMinutes} min)`);

  // Phase breakdown
  if (timing.phases.length > 0) {
    console.log('\n  Phase Breakdown:');
    const maxPhase = Math.max(...timing.phases.map(p => p.durationMinutes));
    for (const phase of timing.phases) {
      const barLen = maxPhase > 0 ? Math.round((phase.durationMinutes / maxPhase) * 20) : 0;
      const bar = '#'.repeat(barLen) + '-'.repeat(20 - barLen);
      console.log(`    ${pad(phase.phase, 8)} ${pad(formatDuration(phase.durationMinutes), 8)} ${bar}`);
    }
  }

  // Overall compliance score
  console.log('\n' + line());
  console.log('OVERALL COMPLIANCE SCORE');
  console.log(line());
  console.log();
  const overallStatus = getScoreStatus(scores.overall);
  console.log(`  Overall  ${createBar(scores.overall)} ${scores.overall}% ${overallStatus}  Grade: ${scores.grade}`);

  // Dimension breakdown
  console.log('\n' + line());
  console.log('DIMENSION BREAKDOWN');
  console.log(line());
  console.log();

  const dims = [
    { name: 'Handoff Completeness', data: scores.dimensions.handoffCompleteness, weight: '25%' },
    { name: 'Handoff Quality', data: scores.dimensions.handoffQuality, weight: '25%' },
    { name: 'Gate Compliance', data: scores.dimensions.gateCompliance, weight: '25%' },
    { name: 'Sequence Compliance', data: scores.dimensions.sequenceCompliance, weight: '15%' },
    { name: 'Duration Efficiency', data: scores.dimensions.durationEfficiency, weight: '10%' }
  ];

  for (const dim of dims) {
    const status = getScoreStatus(dim.data.score);
    console.log(`  ${pad(dim.name, 22)} ${createBar(dim.data.score)} ${pad(dim.data.score + '%', 4)} ${status}`);
  }

  // Handoff summary
  console.log('\n' + line());
  console.log('HANDOFF SUMMARY');
  console.log(line());
  console.log();

  const acceptedHandoffs = data.handoffs.filter(h => h.status === 'accepted');
  const pendingHandoffs = data.handoffs.filter(h => h.status === 'pending');

  console.log(`  Total Handoffs: ${data.handoffs.length}${data.isOrchestrator ? ` (across ${data.children.length + 1} SDs)` : ''}`);
  console.log(`    Accepted: ${acceptedHandoffs.length}`);
  console.log(`    Pending:  ${pendingHandoffs.length}`);

  // Children summary for orchestrators
  if (data.isOrchestrator && data.children.length > 0) {
    console.log(`\n  CHILD SDs (${data.children.length})`);
    for (const child of data.children) {
      const status = child.sd.status === 'completed' ? '[OK]' : '[--]';
      console.log(`    ${status} ${child.sd.id}: ${child.sd.title}`);
    }
  }

  // Gate compliance details
  const gateDetails = scores.dimensions.gateCompliance.details;
  if (gateDetails.checks && gateDetails.checks.length > 0) {
    console.log('\n' + line());
    console.log('GATE CHECKS');
    console.log(line());
    console.log();
    for (const check of gateDetails.checks) {
      const icon = check.passed ? '[OK]' : '[!!]';
      console.log(`  ${icon} ${check.name}: ${check.value}`);
    }
  }

  // Duration efficiency details
  const durDetails = scores.dimensions.durationEfficiency.details;
  if (durDetails.actualHours !== undefined) {
    console.log('\n' + line());
    console.log('DURATION ANALYSIS');
    console.log(line());
    console.log();
    console.log(`  Actual:   ${durDetails.actualHours} hours`);
    console.log(`  Expected: ${durDetails.expectedHours} hours (for ${durDetails.sdType})`);
    console.log(`  Ratio:    ${durDetails.ratio}x`);
  }

  console.log('\n' + '='.repeat(BOX_WIDTH));
}
