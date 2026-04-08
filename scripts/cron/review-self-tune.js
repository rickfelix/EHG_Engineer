#!/usr/bin/env node

/**
 * Weekly Self-Tune Cron for /ship Review Gate
 *
 * Analyzes 90-day review finding history and outputs threshold recommendations.
 * Advisory only — does not auto-adjust thresholds.
 *
 * Usage: node scripts/cron/review-self-tune.js
 * Schedule: Weekly (e.g., Sunday midnight)
 */

import { getReviewHistory } from '../../lib/ship/review-findings-logger.js';

async function selfTune() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  REVIEW GATE SELF-TUNE (90-day analysis)');
  console.log('═══════════════════════════════════════════════════\n');

  const history = await getReviewHistory(90);

  if (history.totalReviews < 10) {
    console.log(`  Insufficient data: ${history.totalReviews} reviews (need ≥10)`);
    console.log('  Skipping threshold analysis.\n');
    return;
  }

  const { tierDistribution, findingPatterns, totalReviews, blockRate } = history;

  // Tier distribution
  console.log('  Tier Distribution:');
  for (const [tier, count] of Object.entries(tierDistribution)) {
    const pct = Math.round((count / totalReviews) * 100);
    console.log(`    ${tier.padEnd(10)} ${count} (${pct}%)`);
  }
  console.log();

  // Finding patterns
  console.log('  Finding Patterns:');
  for (const [type, count] of Object.entries(findingPatterns)) {
    console.log(`    ${type.padEnd(10)} ${count}`);
  }
  console.log();

  // Block rate
  console.log(`  Block Rate: ${blockRate}%`);
  console.log();

  // Threshold recommendations
  console.log('  Recommendations:');
  const lightPct = Math.round(((tierDistribution.light || 0) / totalReviews) * 100);
  const deepPct = Math.round(((tierDistribution.deep || 0) / totalReviews) * 100);

  if (lightPct > 75) {
    console.log('    - Light tier >75% — consider lowering Light threshold to catch more issues');
  } else if (lightPct < 40) {
    console.log('    - Light tier <40% — consider raising Light threshold to reduce review friction');
  } else {
    console.log('    ✅ Light tier distribution within target range (40-75%)');
  }

  if (deepPct > 20) {
    console.log('    - Deep tier >20% — consider raising Deep threshold to reduce agent cost');
  } else if (deepPct < 5 && totalReviews > 30) {
    console.log('    - Deep tier <5% — consider lowering Deep threshold for better security coverage');
  } else {
    console.log('    ✅ Deep tier distribution within target range (5-20%)');
  }

  if (blockRate > 25) {
    console.log('    - Block rate >25% — may indicate too-sensitive thresholds or code quality issue');
  } else {
    console.log('    ✅ Block rate within acceptable range (<25%)');
  }

  console.log('\n═══════════════════════════════════════════════════');
}

selfTune().catch(err => {
  console.error('Self-tune failed:', err.message);
  process.exit(1);
});
