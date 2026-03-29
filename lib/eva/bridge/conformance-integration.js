/**
 * Conformance Integration — Post-provisioning conformance check for ventures
 *
 * Wraps venture-conformance-check.js for programmatic use by venture-provisioner.js.
 * Runs the 28-check conformance suite against a venture repo path, evaluates against
 * a configurable threshold, and returns structured results for provisioning state updates.
 *
 * Created by: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-E
 *
 * @module lib/eva/bridge/conformance-integration
 */

import { runConformanceCheck } from '../../../scripts/venture-conformance-check.js';

const DEFAULT_THRESHOLD = 80;

/**
 * Run venture conformance check and evaluate against threshold.
 *
 * @param {string} ventureRepoPath - Absolute path to the venture repository
 * @param {Object} [options]
 * @param {number} [options.threshold] - Minimum conformance score (default: VENTURE_CONFORMANCE_THRESHOLD env or 80)
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {{ passed: boolean, score: number, threshold: number, total: number, passing: number, failing: number, failedChecks: Array<{name: string, details: string}> }}
 */
export function evaluateConformance(ventureRepoPath, { threshold, logger } = {}) {
  // Normalize logger: accept a bare function or a console-like object
  if (typeof logger === 'function') {
    logger = { log: logger, warn: logger };
  } else if (!logger) {
    logger = console;
  }
  const effectiveThreshold = threshold
    ?? (parseInt(process.env.VENTURE_CONFORMANCE_THRESHOLD, 10) || DEFAULT_THRESHOLD);

  logger.log(`[conformance] Running conformance check on: ${ventureRepoPath} (threshold: ${effectiveThreshold})`);

  const results = runConformanceCheck(ventureRepoPath);
  const passing = results.filter(r => r.pass).length;
  const failing = results.filter(r => !r.pass).length;
  const total = results.length;
  const score = total > 0 ? Math.round((passing / total) * 100) : 0;
  const passed = score >= effectiveThreshold;

  const failedChecks = results
    .filter(r => !r.pass)
    .map(r => ({ name: r.name, details: r.details }));

  if (passed) {
    logger.log(`[conformance] PASS: score ${score}/${effectiveThreshold} threshold (${passing}/${total} checks)`);
  } else {
    logger.warn(`[conformance] FAIL: score ${score} below threshold ${effectiveThreshold} (${failing} failed checks)`);
    failedChecks.forEach(c => logger.warn(`  - ${c.name}: ${c.details}`));
  }

  return {
    passed,
    score,
    threshold: effectiveThreshold,
    total,
    passing,
    failing,
    failedChecks,
  };
}

/**
 * Build metadata object for venture_provisioning_state update.
 *
 * @param {{ passed: boolean, score: number, threshold: number, failedChecks: Array }} conformanceResult
 * @returns {Object} Metadata to merge into provisioning state
 */
export function buildConformanceMetadata(conformanceResult) {
  return {
    conformance_score: conformanceResult.score,
    conformance_threshold: conformanceResult.threshold,
    conformance_passed: conformanceResult.passed,
    conformance_checks_total: conformanceResult.total,
    conformance_checks_passing: conformanceResult.passing,
    conformance_failed_checks: conformanceResult.failedChecks,
    conformance_checked_at: new Date().toISOString(),
  };
}
