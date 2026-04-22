/**
 * Stage 20 Analysis Step — Code Quality Gate
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-C
 *
 * Clones the venture GitHub repo and runs automated validation:
 * npm audit, secret detection, lint, and test suite execution.
 * Returns structured findings with pass/fail verdict.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-20-code-quality
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const execAsync = promisify(exec);

const CHECK_TYPES = ['npm_audit', 'secret_detection', 'lint', 'test_suite'];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'];
const VERDICT_OPTIONS = ['PASS', 'FAIL', 'WARN'];

// Secret patterns to scan for (common API key formats)
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
  /(?:secret|token|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  /sk[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/g,  // Stripe keys
  /AIza[a-zA-Z0-9_\-]{35}/g,                     // Google API keys
  /ghp_[a-zA-Z0-9]{36}/g,                        // GitHub PATs
  /AKIA[A-Z0-9]{16}/g,                           // AWS access keys
];

// Files/dirs to exclude from secret scanning
const SECRET_SCAN_EXCLUDES = [
  'node_modules', '.git', 'package-lock.json', 'yarn.lock',
  '.env.example', '.env.sample', 'README.md', '*.test.*', '*.spec.*',
];

/**
 * Clone a GitHub repo into a temp directory.
 * @returns {Promise<{dir: string, success: boolean, error?: string}>}
 */
async function cloneRepo(repoUrl) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'ehg-s20-'));
  try {
    await execAsync(`git clone --depth 1 "${repoUrl}" "${tempDir}/repo"`, { timeout: 60000 });
    return { dir: path.join(tempDir, 'repo'), tempRoot: tempDir, success: true };
  } catch (err) {
    return { dir: null, tempRoot: tempDir, success: false, error: err.message };
  }
}

/**
 * Run npm audit on cloned repo.
 */
async function runNpmAudit(repoDir) {
  const findings = [];
  try {
    // Check if package.json exists
    await execAsync(`test -f "${repoDir}/package.json"`, { timeout: 5000 });
    const { stdout } = await execAsync(`cd "${repoDir}" && npm audit --json 2>/dev/null || true`, { timeout: 30000 });
    try {
      const audit = JSON.parse(stdout);
      const vulns = audit.vulnerabilities || {};
      for (const [name, vuln] of Object.entries(vulns)) {
        findings.push({
          check: 'npm_audit',
          title: `${name}: ${vuln.title || vuln.severity || 'vulnerability'}`,
          severity: vuln.severity || 'medium',
          detail: vuln.url || vuln.range || '',
        });
      }
    } catch { /* non-JSON output, no findings */ }
  } catch {
    findings.push({ check: 'npm_audit', title: 'No package.json found', severity: 'info', detail: 'Skipped npm audit' });
  }
  return findings;
}

/**
 * Scan for exposed secrets in code files.
 */
async function runSecretScan(repoDir) {
  const findings = [];
  try {
    const excludeArgs = SECRET_SCAN_EXCLUDES.map(e => `--exclude-dir="${e}"`).join(' ');
    const { stdout } = await execAsync(
      `grep -rn ${excludeArgs} -E "(api_key|apikey|secret|token|password)\\s*[:=]\\s*['\\\"][^'\\\"]{8,}" "${repoDir}" 2>/dev/null | head -50 || true`,
      { timeout: 15000 }
    );
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):(.*)/);
        if (match) {
          const filePath = match[1].replace(repoDir, '').replace(/^[/\\]/, '');
          findings.push({
            check: 'secret_detection',
            title: `Potential secret in ${filePath}:${match[2]}`,
            severity: 'critical',
            detail: match[3].trim().substring(0, 100) + '...',
          });
        }
      }
    }
  } catch { /* grep failed, no findings */ }
  return findings;
}

/**
 * Run lint check if eslint/config exists.
 */
async function runLintCheck(repoDir) {
  const findings = [];
  try {
    const { stdout } = await execAsync(
      `cd "${repoDir}" && npx eslint . --format json --max-warnings 100 2>/dev/null || true`,
      { timeout: 30000 }
    );
    try {
      const results = JSON.parse(stdout);
      const errorCount = results.reduce((sum, f) => sum + (f.errorCount || 0), 0);
      const warnCount = results.reduce((sum, f) => sum + (f.warningCount || 0), 0);
      if (errorCount > 0) {
        findings.push({ check: 'lint', title: `${errorCount} lint errors`, severity: 'high', detail: `${warnCount} warnings` });
      }
      if (warnCount > 0 && errorCount === 0) {
        findings.push({ check: 'lint', title: `${warnCount} lint warnings (no errors)`, severity: 'low', detail: '' });
      }
    } catch {
      findings.push({ check: 'lint', title: 'No ESLint config found', severity: 'info', detail: 'Skipped lint' });
    }
  } catch {
    findings.push({ check: 'lint', title: 'Lint check failed', severity: 'info', detail: 'ESLint not available' });
  }
  return findings;
}

/**
 * Run test suite if test script exists.
 */
async function runTestSuite(repoDir) {
  const findings = [];
  try {
    await execAsync(`test -f "${repoDir}/package.json"`, { timeout: 5000 });
    const { stdout: pkgJson } = await execAsync(`cat "${repoDir}/package.json"`, { timeout: 5000 });
    const pkg = JSON.parse(pkgJson);
    if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      try {
        await execAsync(`cd "${repoDir}" && npm test 2>&1`, { timeout: 60000 });
        findings.push({ check: 'test_suite', title: 'Tests passed', severity: 'info', detail: '' });
      } catch (err) {
        findings.push({ check: 'test_suite', title: 'Test suite failed', severity: 'high', detail: (err.stderr || err.message || '').substring(0, 200) });
      }
    } else {
      findings.push({ check: 'test_suite', title: 'No test script defined', severity: 'medium', detail: 'package.json has no meaningful test script' });
    }
  } catch {
    findings.push({ check: 'test_suite', title: 'No package.json', severity: 'info', detail: 'Skipped tests' });
  }
  return findings;
}

/**
 * Main analysis function for S20 Code Quality Gate.
 */
export async function analyzeStage20CodeQuality(params) {
  const { stage19Data, ventureName, ventureId, supabase, logger = console } = params;

  logger.info?.(`[S20-CodeQuality] Starting code quality gate for ${ventureName || 'unknown'}`);

  // Get GitHub repo URL from venture_resources
  let repoUrl = null;
  if (supabase && ventureId) {
    const { data: resources } = await supabase
      .from('venture_resources')
      .select('github_repo')
      .eq('venture_id', ventureId)
      .single();
    repoUrl = resources?.github_repo;
  }

  // Fallback: check stage19Data for repo URL
  if (!repoUrl && stage19Data) {
    repoUrl = stage19Data.github_repo || stage19Data.repo_url || stage19Data.__byType?.build_mvp_build?.github_repo;
  }

  if (!repoUrl) {
    logger.warn('[S20-CodeQuality] No GitHub repo URL found. Returning advisory-only report.');
    return buildNoRepoReport(ventureName);
  }

  logger.info?.(`[S20-CodeQuality] Cloning repo: ${repoUrl}`);
  const clone = await cloneRepo(repoUrl);

  if (!clone.success) {
    logger.error('[S20-CodeQuality] Clone failed:', clone.error);
    return buildCloneFailedReport(ventureName, repoUrl, clone.error);
  }

  try {
    // Run all 4 checks
    const [auditFindings, secretFindings, lintFindings, testFindings] = await Promise.all([
      runNpmAudit(clone.dir),
      runSecretScan(clone.dir),
      runLintCheck(clone.dir),
      runTestSuite(clone.dir),
    ]);

    const allFindings = [...auditFindings, ...secretFindings, ...lintFindings, ...testFindings];

    // Determine verdict
    const hasCritical = allFindings.some(f => f.severity === 'critical');
    const hasHigh = allFindings.some(f => f.severity === 'high');
    const verdict = hasCritical ? 'FAIL' : hasHigh ? 'WARN' : 'PASS';

    return {
      verdict,
      repo_url: repoUrl,
      venture_name: ventureName,
      findings: allFindings,
      summary: {
        total_findings: allFindings.length,
        by_severity: {
          critical: allFindings.filter(f => f.severity === 'critical').length,
          high: allFindings.filter(f => f.severity === 'high').length,
          medium: allFindings.filter(f => f.severity === 'medium').length,
          low: allFindings.filter(f => f.severity === 'low').length,
          info: allFindings.filter(f => f.severity === 'info').length,
        },
        by_check: {
          npm_audit: auditFindings.length,
          secret_detection: secretFindings.length,
          lint: lintFindings.length,
          test_suite: testFindings.length,
        },
      },
      checks_run: CHECK_TYPES.length,
    };
  } finally {
    // Clean up temp directory
    try { await rm(clone.tempRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function buildNoRepoReport(ventureName) {
  return {
    verdict: 'FAIL',
    repo_url: null,
    venture_name: ventureName,
    findings: [{ check: 'repo_access', title: 'No GitHub repo URL found in venture_resources', severity: 'critical', detail: 'S19 must complete and store github_repo before S20 can validate' }],
    summary: { total_findings: 1, by_severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 }, by_check: {} },
    checks_run: 0,
  };
}

function buildCloneFailedReport(ventureName, repoUrl, error) {
  return {
    verdict: 'FAIL',
    repo_url: repoUrl,
    venture_name: ventureName,
    findings: [{ check: 'repo_access', title: `Failed to clone repo: ${repoUrl}`, severity: 'critical', detail: error }],
    summary: { total_findings: 1, by_severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 }, by_check: {} },
    checks_run: 0,
  };
}

export { CHECK_TYPES, SEVERITY_LEVELS, VERDICT_OPTIONS };
