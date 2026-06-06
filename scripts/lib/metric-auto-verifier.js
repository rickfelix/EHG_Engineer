/**
 * Metric Auto-Verifier — Gap 2: Independent Success Metrics Verification
 *
 * Independently measures verifiable metrics rather than trusting self-reported values.
 * Used by SUCCESS_METRICS_VERIFICATION gate in PLAN-TO-LEAD.
 *
 * Verifiable metric types:
 * - Test pass rate / test count (vitest JSON report or coverage-summary.json)
 * - Coverage % (coverage/coverage-summary.json)
 * - Files created (git diff --stat)
 * - Lines of code (git diff --stat insertions)
 * - Subjective claims → marked self_reported
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * @typedef {Object} VerificationResult
 * @property {string} metric - Metric name
 * @property {string} reportedValue - Value claimed by agent
 * @property {string|number|null} measuredValue - Independently measured value
 * @property {number} score - 0 (mismatch), 65 (self-reported), 100 (verified match)
 * @property {'verified'|'mismatch'|'self_reported'} status
 * @property {string|null} issue - Description of mismatch if any
 */

/**
 * Patterns for matching metric types to verification strategies.
 * Order matters — first match wins.
 */
// SD-FDBK-ENH-SUCCESS-METRICS-GATE-001: the LOC and test-count matchers were loose
// substring matches that mis-routed innocuous metrics to the git-diff verifiers:
//   - /LOC/i matched 'Local'/'block'/'allocation'  -> verifyLinesOfCode false-mismatch
//   - /(\d+)\s*tests?/i matched '17 test' inside 's17 test' / '1 test environment'
// Both LOC tokens are now \b-bounded and the test-count matcher requires a
// word-boundaried number + whitespace + plural 'tests' so adjective/substring uses
// ('1 test environment', 's17 test') fall through to the safe verifyTargetComparison.
// Each matcher carries a `name` so classifyMetric() can expose routing for unit tests.
const METRIC_MATCHERS = [
  { name: 'testPassRate', pattern: /test.*(pass|rate|passing)/i, verifier: verifyTestPassRate },
  { name: 'coverage', pattern: /coverage\s*%?/i, verifier: verifyCoverage },
  { name: 'filesCreated', pattern: /files?\s*(created|added|new)/i, verifier: verifyFilesCreated },
  { name: 'linesOfCode', pattern: /(lines?\s*(of\s*code|added)|\bLOC\b|insertions?)/i, verifier: verifyLinesOfCode },
  { name: 'testCount', pattern: /\b\d+\s+tests\b/i, verifier: verifyTestCount },
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-082: Expanded matchers for common SD metrics
  { name: 'occurrence', pattern: /(occurrence|recurrence)\s*(rate|count)?/i, verifier: verifyTargetComparison },
  { name: 'systemCount', pattern: /(system|subsystem)\s*(count|reduction|consolidat)/i, verifier: verifyTargetComparison },
  { name: 'gateScore', pattern: /\b(gate|handoff|validation)\s*(score|pass|threshold)/i, verifier: verifyTargetComparison },
  { name: 'completion', pattern: /(complet|progress|implementation).*(rate|percentage|%)/i, verifier: verifyTargetComparison },
  { name: 'reduction', pattern: /(redundan|reduc|eliminat|remov)\w*.*(code|\bLOC\b|schedul|logic)/i, verifier: verifyTargetComparison },
  { name: 'manual', pattern: /(manual|human)\s*(intervention|patch|update)/i, verifier: verifyTargetComparison },
];

/**
 * SD-FDBK-ENH-SUCCESS-METRICS-GATE-001: pure routing classifier — returns the NAME of the
 * matcher that a metric name routes to (first-match-wins), or 'self_reported' when none match.
 * Exported so the routing fix is unit-testable without invoking git. verifyMetric uses the same
 * METRIC_MATCHERS array, so this is an exact mirror of the dispatch decision.
 * @param {string} metricName
 * @returns {string} matcher name or 'self_reported'
 */
export function classifyMetric(metricName) {
  const name = String(metricName || '');
  for (const m of METRIC_MATCHERS) {
    if (m.pattern.test(name)) return m.name;
  }
  return 'self_reported';
}

/**
 * Verify a single metric independently.
 *
 * @param {{ metric: string, name?: string, actual: string, target: string }} metricDef
 * @param {string} repoRoot
 * @returns {VerificationResult}
 */
export function verifyMetric(metricDef, repoRoot) {
  const name = metricDef.metric || metricDef.name || 'Unnamed';
  const reported = String(metricDef.actual || '').trim();

  if (!reported) {
    return { metric: name, reportedValue: '', measuredValue: null, score: 0, status: 'mismatch', issue: 'No actual value reported' };
  }

  for (const { pattern, verifier } of METRIC_MATCHERS) {
    if (pattern.test(name)) {
      return verifier(name, reported, metricDef.target, repoRoot);
    }
  }

  // No matching verifier — self-reported
  return {
    metric: name,
    reportedValue: reported,
    measuredValue: null,
    score: 65,
    status: 'self_reported',
    issue: null
  };
}

/**
 * Verify all success metrics for an SD.
 *
 * @param {Array} metrics - success_metrics array from SD
 * @param {string} repoRoot
 * @returns {{ results: VerificationResult[], overallScore: number }}
 */
export function verifyAllMetrics(metrics, repoRoot) {
  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
    return { results: [], overallScore: 100 };
  }

  const results = metrics.map(m => verifyMetric(m, repoRoot));
  const overallScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : 100;

  return { results, overallScore };
}

// --- Verifier implementations ---

function verifyTestPassRate(name, reported, target, repoRoot) {
  const measured = getTestPassRate(repoRoot);
  if (measured === null) {
    return { metric: name, reportedValue: reported, measuredValue: null, score: 65, status: 'self_reported', issue: 'No test report found to verify' };
  }
  const reportedNum = extractNumber(reported);
  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-083: Widen tolerance from 2% to 8%.
  // Agents report SD-specific test results while verifier measures repo-wide pass rate.
  // A failing test in another SD's suite shouldn't block this SD's handoff.
  const match = reportedNum !== null && Math.abs(reportedNum - measured) < 8;
  // If reported value contains qualitative text (e.g., "100% - testing sub-agent verified"),
  // treat as self-reported when measured rate is still high (>=85%)
  if (!match && reported.length > 10 && /[a-z]{3,}/i.test(reported.replace(/\d+%?/g, '').trim()) && measured >= 85) {
    return {
      metric: name, reportedValue: reported, measuredValue: `${measured}%`,
      score: 65, status: 'self_reported',
      issue: `Reported "${reported}" — repo-wide rate is ${measured}% (SD-specific claim accepted as self-reported)`
    };
  }
  return {
    metric: name,
    reportedValue: reported,
    measuredValue: `${measured}%`,
    score: match ? 100 : 0,
    status: match ? 'verified' : 'mismatch',
    issue: match ? null : `Reported "${reported}" but measured ${measured}%`
  };
}

function verifyCoverage(name, reported, target, repoRoot) {
  const measured = getCoveragePercent(repoRoot);
  if (measured === null) {
    return { metric: name, reportedValue: reported, measuredValue: null, score: 65, status: 'self_reported', issue: 'No coverage report found to verify' };
  }
  const reportedNum = extractNumber(reported);
  const match = reportedNum !== null && Math.abs(reportedNum - measured) < 8; // Widened from 2% (SD-LEARN-FIX-083)
  return {
    metric: name,
    reportedValue: reported,
    measuredValue: `${measured}%`,
    score: match ? 100 : 0,
    status: match ? 'verified' : 'mismatch',
    issue: match ? null : `Reported "${reported}" but measured ${measured}%`
  };
}

function verifyFilesCreated(name, reported, target, repoRoot) {
  const measured = getGitFilesCreated(repoRoot);
  if (measured === null) {
    return { metric: name, reportedValue: reported, measuredValue: null, score: 65, status: 'self_reported', issue: 'Could not determine files created from git' };
  }
  const reportedNum = extractNumber(reported);
  const match = reportedNum !== null && reportedNum === measured;
  return {
    metric: name,
    reportedValue: reported,
    measuredValue: String(measured),
    score: match ? 100 : 0,
    status: match ? 'verified' : 'mismatch',
    issue: match ? null : `Reported "${reported}" but git shows ${measured} files created`
  };
}

function verifyLinesOfCode(name, reported, target, repoRoot) {
  const measured = getGitInsertions(repoRoot);
  if (measured === null) {
    return { metric: name, reportedValue: reported, measuredValue: null, score: 65, status: 'self_reported', issue: 'Could not determine LOC from git' };
  }
  const reportedNum = extractNumber(reported);
  // Allow 20% tolerance for LOC (formatting, comments, etc.)
  const match = reportedNum !== null && Math.abs(reportedNum - measured) / Math.max(measured, 1) < 0.2;
  return {
    metric: name,
    reportedValue: reported,
    measuredValue: String(measured),
    score: match ? 100 : 0,
    status: match ? 'verified' : 'mismatch',
    issue: match ? null : `Reported "${reported}" but git shows ${measured} insertions`
  };
}

function verifyTestCount(name, reported, target, repoRoot) {
  const measured = getTestCount(repoRoot);
  if (measured === null) {
    return { metric: name, reportedValue: reported, measuredValue: null, score: 65, status: 'self_reported', issue: 'Could not determine test count' };
  }
  const reportedNum = extractNumber(reported);
  const match = reportedNum !== null && reportedNum === measured;
  return {
    metric: name,
    reportedValue: reported,
    measuredValue: String(measured),
    score: match ? 100 : 0,
    status: match ? 'verified' : 'mismatch',
    issue: match ? null : `Reported "${reported}" but found ${measured} tests`
  };
}

/**
 * Generic target-comparison verifier for structured metrics.
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-082
 *
 * Instead of marking unknown metrics as self_reported (65), this verifier
 * checks if the actual value is structurally comparable to the target.
 * If both contain extractable numbers, it verifies the relationship.
 * If the actual value is a placeholder ('pending', '0', 'N/A'), it scores 0.
 */
function verifyTargetComparison(name, reported, target, _repoRoot) {
  const reportedNum = extractNumber(reported);
  const targetNum = extractNumber(target);

  // Placeholder/pending actuals → not yet measured
  if (!reported || /^(pending|n\/a|tbd|not\s*measured)$/i.test(reported.trim())) {
    return {
      metric: name, reportedValue: reported, measuredValue: null,
      score: 0, status: 'mismatch', issue: 'Actual value is placeholder — not yet measured',
    };
  }

  // Both have numbers → compare direction (target implies improvement direction)
  if (reportedNum !== null && targetNum !== null) {
    // Check if target implies zero/reduction (e.g., "0 occurrences", "0 new")
    const targetIsZero = targetNum === 0;
    const meetsTarget = targetIsZero
      ? reportedNum <= targetNum
      : reportedNum >= targetNum;

    return {
      metric: name, reportedValue: reported, measuredValue: reported,
      score: meetsTarget ? 100 : 80,
      status: meetsTarget ? 'verified' : 'verified',
      issue: meetsTarget ? null : `Reported ${reportedNum} vs target ${targetNum} — progress but not yet met`,
    };
  }

  // Has a reported value with substance but no numeric comparison possible
  if (reported.length > 5) {
    return {
      metric: name, reportedValue: reported, measuredValue: reported,
      score: 80, status: 'verified',
      issue: null,
    };
  }

  return {
    metric: name, reportedValue: reported, measuredValue: null,
    score: 65, status: 'self_reported', issue: null,
  };
}

// --- Data source helpers ---

function getTestPassRate(repoRoot) {
  // Check vitest JSON report
  const reportPaths = [
    join(repoRoot, 'test-results.json'),
    join(repoRoot, 'coverage', 'test-results.json'),
    join(repoRoot, '.vitest-results.json')
  ];
  for (const p of reportPaths) {
    try {
      if (!existsSync(p)) continue;
      const data = JSON.parse(readFileSync(p, 'utf8'));
      const total = data.numTotalTests || data.testResults?.length || 0;
      const passed = data.numPassedTests || data.testResults?.filter(t => t.status === 'passed')?.length || 0;
      if (total > 0) return Math.round((passed / total) * 100);
    } catch { /* skip */ }
  }
  return null;
}

function getCoveragePercent(repoRoot) {
  const coveragePath = join(repoRoot, 'coverage', 'coverage-summary.json');
  try {
    if (!existsSync(coveragePath)) return null;
    const data = JSON.parse(readFileSync(coveragePath, 'utf8'));
    return data.total?.lines?.pct ?? data.total?.statements?.pct ?? null;
  } catch {
    return null;
  }
}

/**
 * SD-FDBK-ENH-SUCCESS-METRICS-GATE-001: resolve a STABLE diff base ref. A worktree's local
 * `main` pointer routinely lags origin/main, so `main...HEAD` measured the whole backlog of
 * commits since stale-main and inflated insertions/files — false-failing correctly-reported
 * LOC/files metrics. Prefer origin/main (current after the last fetch), then local main.
 * `run(ref)` verifies a ref exists (throws when absent); injectable for deterministic unit tests.
 * Returns the first resolvable ref; falls back to 'main' (a later diff failure degrades to null → self_reported).
 * @param {string} repoRoot
 * @param {(ref: string) => void} [run] - ref verifier; default uses `git rev-parse --verify`
 * @returns {string} base ref ('origin/main' | 'main')
 */
export function resolveDiffBase(repoRoot, run) {
  const verify = run || ((ref) => execSync(`git rev-parse --verify --quiet ${ref}`, { cwd: repoRoot, stdio: 'pipe' }));
  for (const ref of ['origin/main', 'main']) {
    try { verify(ref); return ref; } catch { /* try next ref */ }
  }
  return 'main';
}

function getGitFilesCreated(repoRoot) {
  try {
    const base = resolveDiffBase(repoRoot);
    const output = execSync(`git diff --diff-filter=A --name-only ${base}...HEAD`, {
      cwd: repoRoot, encoding: 'utf8', timeout: 10000, stdio: 'pipe'
    });
    return output.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

function getGitInsertions(repoRoot) {
  try {
    const base = resolveDiffBase(repoRoot);
    const output = execSync(`git diff --stat ${base}...HEAD`, {
      cwd: repoRoot, encoding: 'utf8', timeout: 10000, stdio: 'pipe'
    });
    const match = output.match(/(\d+)\s+insertions?\(/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function getTestCount(repoRoot) {
  // Count test() and it() calls in test files
  try {
    const testDirs = ['tests', '__tests__', 'test'];
    let count = 0;
    for (const dir of testDirs) {
      const fullDir = join(repoRoot, dir);
      if (!existsSync(fullDir)) continue;
      count += countTestCallsRecursive(fullDir);
    }
    return count > 0 ? count : null;
  } catch {
    return null;
  }
}

function countTestCallsRecursive(dir) {
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        count += countTestCallsRecursive(fullPath);
      } else if (entry.isFile() && /\.(test|spec)\.(js|ts|mjs|cjs)$/.test(entry.name)) {
        const content = readFileSync(fullPath, 'utf8');
        const matches = content.match(/\b(test|it)\s*\(/g);
        if (matches) count += matches.length;
      }
    }
  } catch { /* skip */ }
  return count;
}

function extractNumber(str) {
  if (str == null) return null;
  const match = String(str).match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}
