/**
 * CLI Origin Gate — V06 Dimension Scoring Gate
 *
 * Scoring gate that evaluates CLI authority coverage for handoff validation.
 * Consumes data from cli-write-gate.js (getWriteSourceCoverage) and produces
 * a normalized score for use in handoff gates.
 *
 * Scoring tiers:
 *   100% CLI coverage → 10/10
 *   >80% CLI coverage → 7/10
 *   >50% CLI coverage → 5/10
 *   <50% CLI coverage → 3/10
 *   No data (no writes) → 10/10 (benefit of the doubt)
 *
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-015
 * Dimension: V06 (CLI as Authoritative Workflow Engine)
 */

import { getWriteSourceCoverage } from '../../../lib/eva/cli-write-gate.js';

/**
 * Score CLI origin coverage for a given SD or globally.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {number} [options.lookbackDays] - Days to analyze (default: 7)
 * @param {string} [options.sdKey] - Specific SD to filter (not currently filtered in write-gate, included for future use)
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{passed: boolean, score: number, maxScore: number, coverage: Object, details: string}>}
 */
export async function scoreCLIOrigin(supabase, options = {}) {
  const { lookbackDays = 7, logger = console } = options;

  const { coverage, violations, error } = await getWriteSourceCoverage(supabase, {
    lookbackDays,
    logger,
  });

  if (error) {
    logger.warn(`[CLIOriginGate] Coverage query error: ${error}`);
    // Fail-open: if we can't determine coverage, give benefit of the doubt
    return {
      passed: true,
      score: 5,
      maxScore: 10,
      coverage: { coveragePercent: -1, totalWrites: 0, error },
      details: `CLI origin coverage unavailable: ${error}`,
    };
  }

  const pct = coverage.coveragePercent;
  const totalWrites = coverage.totalWrites;

  // No writes = no violations possible → full score
  if (totalWrites === 0) {
    return {
      passed: true,
      score: 10,
      maxScore: 10,
      coverage,
      details: `No tracked writes in last ${lookbackDays} days — full score`,
    };
  }

  // Score based on coverage percentage
  let score;
  let details;

  if (pct === 100) {
    score = 10;
    details = `100% CLI authority coverage (${totalWrites} writes, 0 violations)`;
  } else if (pct > 80) {
    score = 7;
    details = `${pct}% CLI authority coverage (${totalWrites} writes, ${coverage.violations} violations)`;
  } else if (pct > 50) {
    score = 5;
    details = `${pct}% CLI authority coverage — needs improvement (${coverage.violations} violations)`;
  } else {
    score = 3;
    details = `${pct}% CLI authority coverage — below threshold (${coverage.violations} violations)`;
  }

  // Gate passes if score >= 5 (50% threshold)
  const passed = score >= 5;

  if (!passed) {
    logger.warn(`[CLIOriginGate] FAILED: ${details}`);
    if (violations.length > 0) {
      logger.warn('[CLIOriginGate] Recent violations:');
      for (const v of violations.slice(0, 3)) {
        logger.warn(`  - ${v.table}.${v.operation} from ${v.source} at ${v.at}`);
      }
    }
  }

  return { passed, score, maxScore: 10, coverage, details };
}

/**
 * Get a human-readable CLI origin report.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {number} [options.lookbackDays] - Days to analyze
 * @returns {Promise<string>}
 */
export async function getCLIOriginReport(supabase, options = {}) {
  const { lookbackDays = 7 } = options;
  const result = await scoreCLIOrigin(supabase, { lookbackDays, logger: { warn: () => {} } });

  const lines = [
    '',
    '  CLI Origin Gate (V06)',
    '  ' + '='.repeat(40),
    `  Score:    ${result.score}/${result.maxScore}`,
    `  Status:   ${result.passed ? 'PASS' : 'FAIL'}`,
    `  Coverage: ${result.coverage.coveragePercent}%`,
    `  Writes:   ${result.coverage.totalWrites} (${result.coverage.cliAuthorized} CLI-authorized)`,
    `  Violations: ${result.coverage.violations}`,
    `  Period:   Last ${lookbackDays} days`,
    `  Details:  ${result.details}`,
    '',
  ];

  return lines.join('\n');
}
