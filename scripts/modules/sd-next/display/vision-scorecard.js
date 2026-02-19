/**
 * Vision Portfolio Scorecard Display for SD-Next
 * Part of SD-MAN-INFRA-VISION-PORTFOLIO-SCORECARD-001
 */

import { colors } from '../colors.js';

/**
 * Format a vision score badge with ANSI color coding.
 * Returns ' [V:NN]' with color, or empty string if avg is null/undefined.
 *
 * Color scheme: green ≥90, yellow ≥80, red <80
 *
 * @param {number|null|undefined} avg - Average vision score (0-100)
 * @returns {string} Formatted badge string (includes leading space) or ''
 */
export function formatVisionBadge(avg) {
  if (avg == null) return '';
  const rounded = Math.round(avg);
  const color = rounded >= 90 ? colors.green : rounded >= 80 ? colors.yellow : colors.red;
  return ` ${color}[V:${rounded}]${colors.reset}`;
}

/**
 * Display the portfolio-level vision alignment aggregate.
 * Shows: mean avg across all scored SDs, portfolio trend, and worst-scoring SD.
 * Displayed above the OKR scorecard section.
 *
 * Omitted entirely if visionScores map is empty (graceful degradation).
 *
 * @param {Map<string, {avg: number, trend: string, count: number}>} visionScores
 */
export function displayVisionPortfolioHeader(visionScores) {
  if (!visionScores || visionScores.size === 0) return;

  const entries = Array.from(visionScores.entries());

  // Portfolio avg = mean of per-SD averages (last 3 runs each)
  const portfolioAvg = Math.round(
    entries.reduce((sum, [, v]) => sum + v.avg, 0) / entries.length
  );

  // Portfolio trend = most common direction across all SDs
  const upCount = entries.filter(([, v]) => v.trend === '▲').length;
  const downCount = entries.filter(([, v]) => v.trend === '▼').length;
  const portfolioTrend = upCount > downCount ? '▲' : downCount > upCount ? '▼' : '→';

  // Worst-scoring SD
  const worst = entries.reduce(
    (min, [sdId, v]) => v.avg < min.avg ? { sdId, avg: v.avg } : min,
    { sdId: entries[0][0], avg: entries[0][1].avg }
  );

  const avgColor = portfolioAvg >= 90 ? colors.green : portfolioAvg >= 80 ? colors.yellow : colors.red;
  const trendColor = portfolioTrend === '▲' ? colors.green : portfolioTrend === '▼' ? colors.red : colors.dim;

  console.log(`${colors.dim}┌─ VISION PORTFOLIO ${'─'.repeat(48)}┐${colors.reset}`);
  console.log(`${colors.dim}│${colors.reset} avg=${avgColor}${portfolioAvg}${colors.reset} | trend=${trendColor}${portfolioTrend}${colors.reset} | worst=${colors.dim}${worst.sdId}(${worst.avg})${colors.reset}`);
  console.log(`${colors.dim}└${'─'.repeat(67)}┘${colors.reset}\n`);
}
