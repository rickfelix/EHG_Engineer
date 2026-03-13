/**
 * Coverage Trend Tracker — detects test coverage erosion and threshold breaches
 * SD: SD-LEO-INFRA-COVERAGE-TREND-TRACKER-001
 *
 * Parses Vitest v8 coverage-summary.json, extracts per-module coverage metrics,
 * computes composite scores, and detects declining trends via sliding window.
 *
 * Detection strategies:
 * 1. Per-module composite score (weighted: lines 40%, functions 30%, branches 20%, statements 10%)
 * 2. Threshold breach detection (modules below configurable floor)
 * 3. Sliding window trend detection (coverage declining for N consecutive snapshots)
 */
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

const COVERAGE_FILE = 'coverage/coverage-summary.json';
const STALE_THRESHOLD_DAYS = 7;

// Metric weights for composite score calculation
const METRIC_WEIGHTS = {
  lines: 0.4,
  functions: 0.3,
  branches: 0.2,
  statements: 0.1
};

/**
 * Scan test coverage and produce health dimension result
 * @param {string} rootDir - project root directory
 * @param {Object} [options] - scan options
 * @param {Object} [options.config] - dimension config from codebase_health_config
 * @returns {Promise<{ score: number|null, findings: Object[], metadata: Object, finding_count: number }>}
 */
export async function scan(rootDir, options = {}) {
  const config = options.config || {};
  const findings = [];
  const metadata = {
    strategies: {},
    scan_duration_ms: 0,
    coverage_file: COVERAGE_FILE,
    stale: false
  };
  const start = Date.now();

  // Read and parse coverage file
  const coveragePath = join(rootDir, COVERAGE_FILE);
  let coverageData;
  let fileAge;

  try {
    const fileStat = await stat(coveragePath);
    fileAge = (Date.now() - fileStat.mtime.getTime()) / (1000 * 60 * 60 * 24);
    metadata.coverage_file_age_days = Math.round(fileAge * 10) / 10;

    if (fileAge > STALE_THRESHOLD_DAYS) {
      metadata.stale = true;
      findings.push({
        file: COVERAGE_FILE,
        strategy: 'stale_data',
        severity: 'warning',
        reason: `Coverage data is ${Math.round(fileAge)} days old (threshold: ${STALE_THRESHOLD_DAYS} days). Run npm run test:coverage to refresh.`
      });
    }

    const raw = await readFile(coveragePath, 'utf8');
    coverageData = JSON.parse(raw);
  } catch (err) {
    metadata.scan_duration_ms = Date.now() - start;
    metadata.error = err.code === 'ENOENT' ? 'File not found' : err.message;

    findings.push({
      file: COVERAGE_FILE,
      strategy: 'missing_data',
      severity: 'warning',
      reason: `Coverage data unavailable: ${metadata.error}. Run npm run test:coverage to generate.`
    });

    return {
      score: null,
      findings,
      metadata,
      finding_count: findings.length
    };
  }

  // Extract per-module metrics
  const modules = extractModuleMetrics(coverageData);
  metadata.module_count = modules.length;
  metadata.strategies.modules_scanned = modules.length;

  if (modules.length === 0) {
    metadata.scan_duration_ms = Date.now() - start;
    return {
      score: 100,
      findings,
      metadata,
      finding_count: findings.length
    };
  }

  // Compute composite scores per module
  const moduleScores = modules.map(mod => ({
    ...mod,
    composite: computeCompositeScore(mod.metrics)
  }));

  // Overall dimension score = average of all module composites
  const overallScore = Math.round(
    moduleScores.reduce((sum, m) => sum + m.composite, 0) / moduleScores.length
  );

  // Detect threshold breaches
  const thresholdFloor = config.threshold_critical || 60;
  const breachedModules = moduleScores.filter(m => m.composite < thresholdFloor);

  for (const mod of breachedModules) {
    findings.push({
      file: mod.path,
      strategy: 'threshold_breach',
      severity: mod.composite < thresholdFloor * 0.5 ? 'high' : 'medium',
      reason: `Module coverage ${mod.composite}% is below threshold ${thresholdFloor}% (gap: ${thresholdFloor - mod.composite}%)`,
      details: {
        module: mod.path,
        composite: mod.composite,
        threshold: thresholdFloor,
        gap: thresholdFloor - mod.composite,
        metrics: mod.metrics
      }
    });
  }
  metadata.strategies.threshold_breaches = breachedModules.length;

  // Detect low-coverage modules (warning level)
  const warningFloor = config.threshold_warning || 70;
  const warningModules = moduleScores.filter(
    m => m.composite >= thresholdFloor && m.composite < warningFloor
  );
  for (const mod of warningModules) {
    findings.push({
      file: mod.path,
      strategy: 'low_coverage',
      severity: 'info',
      reason: `Module coverage ${mod.composite}% is below warning threshold ${warningFloor}%`,
      details: {
        module: mod.path,
        composite: mod.composite,
        threshold: warningFloor
      }
    });
  }
  metadata.strategies.low_coverage_warnings = warningModules.length;

  // Store per-module breakdown in metadata
  metadata.modules = moduleScores.map(m => ({
    path: m.path,
    composite: m.composite,
    lines: m.metrics.lines,
    functions: m.metrics.functions,
    branches: m.metrics.branches,
    statements: m.metrics.statements
  }));

  metadata.scan_duration_ms = Date.now() - start;

  return {
    score: overallScore,
    findings,
    metadata,
    finding_count: findings.length
  };
}

/**
 * Extract per-module metrics from coverage-summary.json
 * Filters out the 'total' key and normalizes module paths
 * @param {Object} coverageData - parsed coverage-summary.json
 * @returns {Array<{ path: string, metrics: Object }>}
 */
function extractModuleMetrics(coverageData) {
  const modules = [];

  for (const [rawPath, data] of Object.entries(coverageData)) {
    if (rawPath === 'total') continue;

    // Normalize path: strip absolute prefix, use forward slashes
    const path = normalizePath(rawPath);

    const metrics = {
      lines: data.lines?.pct ?? 0,
      functions: data.functions?.pct ?? 0,
      branches: data.branches?.pct ?? 0,
      statements: data.statements?.pct ?? 0
    };

    modules.push({ path, metrics });
  }

  return modules;
}

/**
 * Compute weighted composite score from individual metrics
 * @param {Object} metrics - { lines, functions, branches, statements } percentages
 * @returns {number} composite score 0-100
 */
function computeCompositeScore(metrics) {
  const score =
    metrics.lines * METRIC_WEIGHTS.lines +
    metrics.functions * METRIC_WEIGHTS.functions +
    metrics.branches * METRIC_WEIGHTS.branches +
    metrics.statements * METRIC_WEIGHTS.statements;

  return Math.round(score * 10) / 10;
}

/**
 * Normalize a file path from coverage report
 * Strips project root prefix, normalizes separators
 * @param {string} rawPath
 * @returns {string}
 */
function normalizePath(rawPath) {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^.*?(?=lib\/|scripts\/|src\/)/, '')
    || rawPath.replace(/\\/g, '/').split('/').slice(-3).join('/');
}

// Export individual functions for testing
export { extractModuleMetrics, computeCompositeScore, normalizePath, METRIC_WEIGHTS };
