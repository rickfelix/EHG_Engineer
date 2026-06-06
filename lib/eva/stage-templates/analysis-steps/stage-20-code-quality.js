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
import { writeFile, lstat, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
// SD-LEO-INFRA-STAGE-CODE-QUALITY-001: reference the canonical category set so the
// analyzer is structurally aware of every Stage-20 finding category (implemented + deferred).
import { FINDING_CATEGORIES } from '../../quality-findings/finding-shape.js';
// SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 FR-A: adopt the canonical FindingShape
// from the parent SD's foundation modules. Output is a parallel
// `canonical_findings` array on the result so downstream FR-B (writer) can
// persist directly into venture_quality_findings without re-shaping. The
// legacy `findings` array stays as-is — no current consumer breaks.
import { adaptLegacyBatch } from '../../quality-findings/legacy-adapter.js';
// FR-D: hardened sandbox helpers — env allowlist + per-run dir cleanup.
// Existing parent SD ships with cloneRepo + execAsync that inherit process.env
// wholesale, leaking host secrets (SUPABASE_*, OPENAI_*, GITHUB_TOKEN) into
// untrusted venture builds. FR-D closes that hole.
import { createSandboxDir, buildEnvAllowlist, detectPackageManager, installArgsFor } from '../../quality-findings/sandbox-driver.js';
// SD-LEO-INFRA-STAGE-ANALYZER-ADD-001: the four canonical categories deferred from
// SD-LEO-INFRA-STAGE-CODE-QUALITY-001 are DB-sourced or environment-based, not
// repo-scannable. collectNonRepoFindings reads venture UAT/bug records + probes the
// runtime, emitting LEGACY-shaped findings that flow through adaptLegacyBatch like
// the repo checks. Best-effort: it never throws out of the analyzer.
import { collectNonRepoFindings } from '../../quality-findings/db-sourced-findings.js';

const execAsync = promisify(exec);

// FR-D: snapshot the allowlist once per module load. Subprocess env is built
// from this list — parent process.env is filtered, secrets do not leak.
const SANDBOX_ENV = buildEnvAllowlist(process.env);
const SANDBOX_ENV_KEYS = Object.keys(SANDBOX_ENV).sort();
const INSTALL_COMMAND = '<pm> install --ignore-scripts (pm auto-detected from lockfile; via sandbox .npmrc)';

// SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-4): per-manager `test`/`audit` invocations.
// Every manager's install is built from sandbox-driver.installArgsFor so the
// --ignore-scripts supply-chain guard is never dropped (FR-3). `audit:null`
// means the manager has no first-class audit command (bun) — the analyzer
// degrades to an informational note rather than emitting a false HIGH.
const PACKAGE_MANAGER_COMMANDS = Object.freeze({
  npm: { test: 'npm test', audit: 'npm audit --json' },
  pnpm: { test: 'pnpm test', audit: 'pnpm audit --json' },
  yarn: { test: 'yarn test', audit: 'yarn audit --json' },
  bun: { test: 'bun test', audit: null },
});

// SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-5): flat-config + legacy ESLint config
// filenames. Detected on disk so a configured repo is NEVER reported
// "No ESLint config found" just because the lint run produced no parseable
// JSON (e.g. eslint/deps absent → empty stdout → JSON.parse throws).
const ESLINT_FLAT_CONFIG_FILES = Object.freeze([
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
]);
const ESLINT_LEGACY_CONFIG_FILES = Object.freeze([
  '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs',
  '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc',
]);

/**
 * FR-5: detect an ESLint config on disk (flat config.js family first, then
 * legacy .eslintrc*). Pure fs read; never throws. A package.json `eslintConfig`
 * key also counts as a legacy config location.
 *
 * @param {string} repoDir
 * @returns {{ present: boolean, file: string|null, flat: boolean }}
 */
export function detectEslintConfig(repoDir) {
  if (!repoDir || typeof repoDir !== 'string') return { present: false, file: null, flat: false };
  const has = (f) => {
    try { return existsSync(path.join(repoDir, f)); } catch { return false; }
  };
  for (const f of ESLINT_FLAT_CONFIG_FILES) {
    if (has(f)) return { present: true, file: f, flat: true };
  }
  for (const f of ESLINT_LEGACY_CONFIG_FILES) {
    if (has(f)) return { present: true, file: f, flat: false };
  }
  return { present: false, file: null, flat: false };
}

/**
 * FR-5: pure outcome classifier for the lint step. Separating the decision
 * from the subprocess spawn makes the three-way distinction unit-testable:
 *
 *   - 'ran'             : eslint produced parseable JSON results.
 *   - 'no_config'       : eslint ran but found no config (only when a config is
 *                         NOT detected on disk; a detected config can never map
 *                         here, closing the "configured repo reported
 *                         unconfigured" bug).
 *   - 'could_not_run'   : eslint/deps absent or the spawn threw, OR output was
 *                         empty/unparseable. Empty/throwing output must NOT
 *                         become 'no_config'.
 *
 * @param {Object} p
 * @param {string} [p.stdout]       - raw stdout from the eslint invocation
 * @param {boolean} [p.threw]       - true if the spawn itself threw
 * @param {boolean} [p.configPresent] - detectEslintConfig().present
 * @returns {{ outcome: 'ran'|'no_config'|'could_not_run', results?: Array }}
 */
export function classifyLintOutcome({ stdout = '', threw = false, configPresent = false } = {}) {
  if (threw) return { outcome: 'could_not_run' };
  const trimmed = (stdout || '').trim();
  if (!trimmed) {
    // Empty output: eslint never produced a report (binary/deps absent, or it
    // errored to stderr which `|| true` swallowed). NOT a "no config" signal.
    return { outcome: 'could_not_run' };
  }
  let results;
  try {
    results = JSON.parse(trimmed);
  } catch {
    // Unparseable, non-empty output (e.g. an eslint error banner) — treat as
    // "could not run", never "no config".
    return { outcome: 'could_not_run' };
  }
  if (!Array.isArray(results)) return { outcome: 'could_not_run' };
  // eslint produced a valid JSON array. If a config is detected on disk this is
  // a real result even when the array is empty (clean repo). Only when NO config
  // is detected do we report the configured-absence as 'no_config'.
  if (results.length === 0 && !configPresent) {
    return { outcome: 'no_config' };
  }
  return { outcome: 'ran', results };
}

/**
 * FR-3: install dependencies into the cloned sandbox repo BEFORE the quality
 * checks run. Without node_modules, `npx eslint` and `npm test` cannot work, so
 * lint reported "No ESLint config found" and tests reported a spurious HIGH
 * "Test suite failed" on every venture. The install is routed through
 * sandbox-driver.installArgsFor so --ignore-scripts is preserved (supply-chain
 * RCE guard), and uses SANDBOX_ENV (no host secrets leak). The sandbox .npmrc
 * (ignore-scripts=true) written by cloneRepo is an additional belt-and-braces
 * layer. Best-effort: a failed/ timed-out install never throws out of the
 * analyzer — the downstream checks still run and self-report "could not run".
 *
 * @param {string} repoDir
 * @param {string} packageManager - detected via detectPackageManager
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=120000]
 * @returns {Promise<{ ran: boolean, manager: string, error?: string }>}
 */
async function installDependencies(repoDir, packageManager, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120000;
  if (!existsSync(path.join(repoDir, 'package.json'))) {
    return { ran: false, manager: packageManager, error: 'no package.json' };
  }
  let args;
  try {
    args = installArgsFor(packageManager);
  } catch (err) {
    return { ran: false, manager: packageManager, error: err.message };
  }
  // installArgsFor guarantees --ignore-scripts is present; assert defensively so
  // a future refactor can never silently drop the supply-chain guard.
  if (!args.includes('--ignore-scripts')) {
    return { ran: false, manager: packageManager, error: 'refused: --ignore-scripts missing from install args' };
  }
  try {
    await execAsync(`${packageManager} ${args.join(' ')}`, {
      cwd: repoDir,
      env: SANDBOX_ENV,
      timeout: timeoutMs,
    });
    return { ran: true, manager: packageManager };
  } catch (err) {
    return { ran: false, manager: packageManager, error: (err.message || String(err)).substring(0, 200) };
  }
}

/**
 * FR-D adversarial-review fix (PR #3450 round 1): strict allowlist of repo URL
 * shapes accepted by cloneRepo. Closes the shell-injection vector where a
 * compromised venture_resources.resource_identifier could embed shell
 * metacharacters and execute attacker code via the shell-interpreted git clone.
 *
 * Accepted: HTTPS GitHub URLs, optionally with .git suffix.
 * Rejected: anything containing $, `, ;, |, &, >, <, \n, \r, quotes, or any
 * non-URL-safe character that has shell meaning.
 */
const SAFE_REPO_URL_RE = /^https:\/\/(?:[\w.-]+@)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;
export function isSafeRepoUrl(url) {
  if (typeof url !== 'string' || url.length > 512) return false;
  if (/[$`;|&><\n\r"'\s]/.test(url)) return false;
  return SAFE_REPO_URL_RE.test(url);
}

/**
 * SD-FDBK-FIX-STAGE-REPOURL-RESOLUTION-001: normalize an `owner/repo` shorthand
 * into a full GitHub HTTPS URL so a provisioner-written shorthand
 * resource_identifier (lib/eva/bridge/venture-provisioner.js writes the
 * `owner/repo` shorthand, with the full URL only in resource metadata) can pass
 * isSafeRepoUrl() instead of permanently blocking S20.
 *
 * SECURITY: normalization is gated on a STRICT shorthand shape (exactly one
 * slash, characters limited to [A-Za-z0-9_.-]) which contains no shell
 * metacharacter or whitespace. Anything else is returned untouched, and
 * isSafeRepoUrl() still validates the result downstream — so this can never
 * turn an unsafe string into a passing URL.
 */
const REPO_SHORTHAND_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export function normalizeRepoUrl(candidate) {
  if (typeof candidate !== 'string') return candidate;
  if (REPO_SHORTHAND_RE.test(candidate)) {
    return `https://github.com/${candidate}`;
  }
  return candidate;
}

// SD-LEO-INFRA-STAGE-CODE-QUALITY-001: expanded from 4 to 8 repo-scannable checks.
// 'secret_detection' is the legacy emitted label for the canonical 'secrets' category.
const CHECK_TYPES = [
  'npm_audit', 'secret_detection', 'lint', 'test_suite',
  'unit_test', 'e2e_test', 'feedback_widget_present', 'error_capture_wired',
];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'];
const VERDICT_OPTIONS = ['PASS', 'FAIL', 'WARN'];

// SD-LEO-INFRA-STAGE-CODE-QUALITY-001 + SD-LEO-INFRA-STAGE-ANALYZER-ADD-001: full
// canonical category coverage. Repo-scannable here: npm_audit, secrets (emitted as
// 'secret_detection'), lint, test_suite, unit_test, e2e_test, feedback_widget_present,
// error_capture_wired. DB-sourced / environment-based (db-sourced-findings.js,
// appended via collectNonRepoFindings): uat_test, bug_report, uat_signoff, capability.
// Every canonical category now has a producer, so DEFERRED_CANONICAL_CATEGORIES is empty.
const IMPLEMENTED_CANONICAL_CATEGORIES = Object.freeze([
  'npm_audit', 'secrets', 'lint', 'test_suite',
  'unit_test', 'e2e_test', 'feedback_widget_present', 'error_capture_wired',
  'uat_test', 'bug_report', 'uat_signoff', 'capability',
]);
const DEFERRED_CANONICAL_CATEGORIES = Object.freeze(
  FINDING_CATEGORIES.filter((c) => !IMPLEMENTED_CANONICAL_CATEGORIES.includes(c))
);

// Vision-Compliance "absence is the failure" severity. Kept as a single named
// constant (currently 'medium' so it surfaces without flipping any currently-PASS
// venture to WARN/FAIL) for an easy future chairman tightening.
const VISION_ABSENCE_SEVERITY = 'medium';

// package.json dependency-name fragments (matched case-insensitively as substrings)
// that indicate each category's instrumentation is present.
const FEEDBACK_WIDGET_SIGNATURES = ['@sentry/', 'logrocket', 'fullstory', '@fullstory/', 'hotjar', 'react-hotjar', 'userback', 'birdeatsbug'];
const ERROR_CAPTURE_SIGNATURES = ['@sentry/', '@bugsnag/', 'bugsnag', 'rollbar', '@rollbar/', '@datadog/browser-rum', 'datadog-rum', 'airbrake', 'honeybadger'];
const UNIT_TEST_SIGNATURES = ['vitest', 'jest', '@jest/', 'mocha', 'ava', 'tape', 'node-tap', 'jasmine', 'uvu'];
const E2E_TEST_SIGNATURES = ['playwright', '@playwright/test', 'cypress', 'puppeteer', 'webdriverio', 'nightwatch', 'testcafe'];

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
 * FR-D: Clone a GitHub repo into a sandboxed dir. The sandbox is created via
 * sandbox-driver.createSandboxDir (UUID-named per-run subdir under os.tmpdir()).
 * A .npmrc with ignore-scripts=true is written into the cloned repo so any
 * subsequent npm/pnpm/yarn invocation inside the sandbox skips lifecycle scripts
 * — closes the supply-chain RCE hole where a malicious package.json postinstall
 * would otherwise execute during analyzer runs.
 *
 * @returns {Promise<{dir: string, sandboxHandle: {tmpDir, cleanup}, success: boolean, error?: string}>}
 */
async function cloneRepo(repoUrl) {
  const sandboxHandle = createSandboxDir('ehg-s20-');
  const repoPath = path.join(sandboxHandle.tmpDir, 'repo');

  // FR-D adversarial-review fix (PR #3450 round 1): repoUrl flows from DB
  // (venture_resources.resource_identifier or ventures.repo_url) or upstream
  // stage19Data — all attacker-influenceable. Reject anything that is not a
  // strict GitHub HTTPS URL before passing to shell-interpreted git clone.
  // Closes the RCE-via-clone-URL vector that env-strip alone does not address.
  if (!isSafeRepoUrl(repoUrl)) {
    return {
      dir: null,
      sandboxHandle,
      success: false,
      error: `Refused to clone: repoUrl failed strict GitHub-URL validation (potential shell-injection vector)`,
    };
  }

  try {
    // git clone uses SANDBOX_ENV — git itself is benign but consistency matters.
    // repoUrl is now allowlist-validated; the embedded quotes are decorative.
    await execAsync(`git clone --depth 1 "${repoUrl}" "${repoPath}"`, {
      timeout: 60000,
      env: SANDBOX_ENV,
    });
    // FR-D adversarial-review fix (PR #3450 round 1): symlink-safe .npmrc
    // write. Closes the TOCTOU where a malicious venture commits .npmrc as
    // a symlink pointing to ~/.npmrc and writeFile would otherwise follow
    // it and corrupt the host config. lstat detects the symlink WITHOUT
    // following it; we unlink and rewrite as a plain regular file. If the
    // venture legitimately ships its own .npmrc as a regular file, we
    // overwrite — this is the intended behavior since the sandbox config
    // must take precedence over venture-supplied config.
    const npmrcPath = path.join(repoPath, '.npmrc');
    try {
      const st = await lstat(npmrcPath);
      if (st.isSymbolicLink()) {
        await unlink(npmrcPath);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await writeFile(
      npmrcPath,
      'ignore-scripts=true\nfund=false\naudit=false\n',
      'utf-8'
    );
    return { dir: repoPath, sandboxHandle, success: true };
  } catch (err) {
    return { dir: null, sandboxHandle, success: false, error: err.message };
  }
}

/**
 * Run a dependency audit on the cloned repo.
 *
 * SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-4): manager-aware. npm/pnpm/yarn expose a
 * `<mgr> audit --json` command; bun has no first-class audit, so it degrades to
 * an informational note rather than a false HIGH/critical finding. The detected
 * manager is passed in (defaults to npm for back-compat with existing callers).
 *
 * @param {string} repoDir
 * @param {string} [packageManager='npm']
 */
async function runNpmAudit(repoDir, packageManager = 'npm') {
  const findings = [];
  try {
    // Check if package.json exists (env stripped + scoped to repoDir)
    await execAsync('test -f package.json', { cwd: repoDir, env: SANDBOX_ENV, timeout: 5000 });

    const auditCmd = PACKAGE_MANAGER_COMMANDS[packageManager]?.audit;
    if (!auditCmd) {
      // bun (or any manager without an audit equivalent): informational only.
      findings.push({
        check: 'npm_audit',
        title: `Dependency audit not available for ${packageManager}`,
        severity: 'info',
        detail: `${packageManager} has no first-class audit command; skipped (not a vulnerability finding).`,
      });
      return findings;
    }

    const { stdout } = await execAsync(`${auditCmd} 2>/dev/null || true`, {
      cwd: repoDir,
      env: SANDBOX_ENV,
      timeout: 30000,
    });
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
 *
 * FR-D adversarial-review fix (PR #3450 round 1): execAsync now passes explicit
 * cwd + env: SANDBOX_ENV. Pre-fix this call inherited process.env wholesale,
 * leaking host secrets into the grep subprocess. Even though grep itself does
 * not use those vars, /proc/<pid>/environ exposes them to co-tenant readers
 * during the 15s window. Defense-in-depth: every analyzer subprocess uses
 * SANDBOX_ENV, no exceptions.
 */
async function runSecretScan(repoDir) {
  const findings = [];
  try {
    const excludeArgs = SECRET_SCAN_EXCLUDES.map(e => `--exclude-dir="${e}"`).join(' ');
    const { stdout } = await execAsync(
      `grep -rn ${excludeArgs} -E "(api_key|apikey|secret|token|password)\\s*[:=]\\s*['\\\"][^'\\\"]{8,}" . 2>/dev/null | head -50 || true`,
      { cwd: repoDir, env: SANDBOX_ENV, timeout: 15000 }
    );
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):(.*)/);
        if (match) {
          // Strip leading ./ since grep against cwd produces relative paths.
          const filePath = match[1].replace(/^\.[\\/]/, '');
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
 *
 * SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-5): the outcome mapping is rewritten to
 * distinguish three cases via the pure classifyLintOutcome helper:
 *   (a) 'could_not_run' — eslint/deps absent or the spawn threw, OR empty/
 *       unparseable output. Reported as an advisory, NEVER as "No ESLint config
 *       found" (the old bug: a deps-less sandbox produced empty stdout →
 *       JSON.parse threw → false "No ESLint config found").
 *   (b) 'no_config'    — eslint ran, produced an empty result array, AND no
 *       config file is detected on disk.
 *   (c) 'ran'          — real result; surface error/warning counts.
 * A flat eslint.config.js (or legacy .eslintrc*) on disk forces a configured
 * repo away from 'no_config' even on empty results.
 */
async function runLintCheck(repoDir) {
  const findings = [];
  const config = detectEslintConfig(repoDir);
  let stdout = '';
  let threw = false;
  try {
    ({ stdout } = await execAsync(
      'npx eslint . --format json --max-warnings 100 2>/dev/null || true',
      { cwd: repoDir, env: SANDBOX_ENV, timeout: 30000 }
    ));
  } catch {
    threw = true;
  }

  const { outcome, results } = classifyLintOutcome({ stdout, threw, configPresent: config.present });

  if (outcome === 'could_not_run') {
    findings.push({
      check: 'lint',
      title: config.present ? 'Lint could not run (eslint/deps unavailable)' : 'Lint could not run',
      severity: 'info',
      detail: config.present
        ? `ESLint config present (${config.file}) but the lint run produced no parseable output — eslint or its deps were unavailable in the sandbox.`
        : 'ESLint did not produce parseable output (eslint or its dependencies were unavailable).',
    });
    return findings;
  }

  if (outcome === 'no_config') {
    findings.push({ check: 'lint', title: 'No ESLint config found', severity: 'info', detail: 'Skipped lint (no eslint config detected on disk and eslint reported no results).' });
    return findings;
  }

  // outcome === 'ran'
  const errorCount = results.reduce((sum, f) => sum + (f.errorCount || 0), 0);
  const warnCount = results.reduce((sum, f) => sum + (f.warningCount || 0), 0);
  if (errorCount > 0) {
    findings.push({ check: 'lint', title: `${errorCount} lint errors`, severity: 'high', detail: `${warnCount} warnings` });
  }
  if (warnCount > 0 && errorCount === 0) {
    findings.push({ check: 'lint', title: `${warnCount} lint warnings (no errors)`, severity: 'low', detail: '' });
  }
  // errorCount===0 && warnCount===0 with a detected config → clean lint, no finding.
  return findings;
}

/**
 * Run test suite if test script exists.
 *
 * SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-4): manager-aware test invocation
 * (`<mgr> test`, or `bun test` for bun). FR-3 installs deps before this runs, so
 * a non-zero exit is now a genuine signal — EXCEPT when the dependency install
 * did not succeed, in which case a failure is environmental, not a real test
 * failure, so it is downgraded to an advisory instead of a false HIGH.
 *
 * @param {string} repoDir
 * @param {string} [packageManager='npm']
 * @param {{ ran: boolean }} [install] - result of installDependencies (FR-3)
 */
async function runTestSuite(repoDir, packageManager = 'npm', install = { ran: true }) {
  const findings = [];
  try {
    await execAsync('test -f package.json', { cwd: repoDir, env: SANDBOX_ENV, timeout: 5000 });
    const { stdout: pkgJson } = await execAsync('cat package.json', { cwd: repoDir, env: SANDBOX_ENV, timeout: 5000 });
    const pkg = JSON.parse(pkgJson);

    // FR-D: surface lifecycle-script presence as advisory. .npmrc in the sandbox
    // already prevents execution; this finding tells operators which ventures
    // have postinstall/preinstall expectations that won't be honored under FR-D.
    const lifecycleScripts = ['preinstall', 'postinstall', 'prepublish', 'prepare', 'install'];
    const presentLifecycle = lifecycleScripts.filter(s => pkg.scripts?.[s]);
    if (presentLifecycle.length > 0) {
      findings.push({
        check: 'test_suite',
        title: `Lifecycle scripts present (blocked by sandbox): ${presentLifecycle.join(', ')}`,
        severity: 'low',
        detail: 'Sandbox writes .npmrc ignore-scripts=true; these scripts will not execute. Document if any are required for venture build.',
      });
    }

    // bun reads its own `[test]` runner and does not require a package.json test
    // script; npm/pnpm/yarn run the package.json `test` script.
    const hasTestScript = pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1';
    const testCmd = PACKAGE_MANAGER_COMMANDS[packageManager]?.test || 'npm test';
    if (hasTestScript || packageManager === 'bun') {
      try {
        await execAsync(`${testCmd} 2>&1`, { cwd: repoDir, env: SANDBOX_ENV, timeout: 60000 });
        findings.push({ check: 'test_suite', title: 'Tests passed', severity: 'info', detail: '' });
      } catch (err) {
        if (install && install.ran === false) {
          // Dependency install did not succeed → a test failure here is almost
          // certainly "cannot find module"/environmental, not a real regression.
          // Downgrade to advisory so S20 does not WARN/FAIL a venture on a
          // sandbox-install problem (the FR-3 root cause this SD fixes).
          findings.push({
            check: 'test_suite',
            title: 'Test suite could not run (dependencies not installed)',
            severity: 'info',
            detail: (err.stderr || err.message || '').substring(0, 200),
          });
        } else {
          findings.push({ check: 'test_suite', title: 'Test suite failed', severity: 'high', detail: (err.stderr || err.message || '').substring(0, 200) });
        }
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
 * SD-LEO-INFRA-STAGE-CODE-QUALITY-001: read package.json dependency names from a
 * cloned repo dir. Pure fs read (no subprocess) for deterministic, sandbox-safe
 * detection. Returns ok=false (not a throw) when package.json is absent/unparseable.
 * @returns {Promise<{names: Set<string>, scripts: object, ok: boolean}>}
 */
async function readPackageDeps(repoDir) {
  try {
    const raw = await readFile(path.join(repoDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    const names = new Set(
      [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
        ...Object.keys(pkg.optionalDependencies || {}),
      ].map((n) => n.toLowerCase())
    );
    return { names, scripts: pkg.scripts || {}, ok: true };
  } catch {
    return { names: new Set(), scripts: {}, ok: false };
  }
}

function depsMatch(names, signatures) {
  for (const dep of names) {
    for (const sig of signatures) {
      if (dep.includes(sig.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * QA — unit_test: detect a unit-test runner in package.json. Absence is a finding.
 */
export async function detectUnitTests(repoDir) {
  const { names, ok } = await readPackageDeps(repoDir);
  if (!ok) return [{ check: 'unit_test', title: 'No package.json — unit tests undetectable', severity: 'info', detail: 'Skipped unit-test detection (no package.json).' }];
  if (depsMatch(names, UNIT_TEST_SIGNATURES)) return [];
  return [{ check: 'unit_test', title: 'No unit-test runner detected', severity: 'medium', detail: `No unit-test runner (${UNIT_TEST_SIGNATURES.slice(0, 4).join(', ')}, ...) found in package.json dependencies.` }];
}

/**
 * QA — e2e_test: detect an end-to-end framework in package.json. Absence is a finding (low).
 */
export async function detectE2eTests(repoDir) {
  const { names, ok } = await readPackageDeps(repoDir);
  if (!ok) return [{ check: 'e2e_test', title: 'No package.json — e2e tests undetectable', severity: 'info', detail: 'Skipped e2e-test detection (no package.json).' }];
  if (depsMatch(names, E2E_TEST_SIGNATURES)) return [];
  return [{ check: 'e2e_test', title: 'No end-to-end test framework detected', severity: 'low', detail: `No e2e framework (${E2E_TEST_SIGNATURES.slice(0, 3).join(', ')}, ...) found in package.json dependencies.` }];
}

/**
 * Vision Compliance — feedback_widget_present: detect a user-feedback widget SDK.
 * Absence is the failure (chairman mandate).
 */
export async function scanFeedbackWidget(repoDir) {
  const { names, ok } = await readPackageDeps(repoDir);
  if (!ok) return [{ check: 'feedback_widget_present', title: 'No package.json — feedback widget undetectable', severity: 'info', detail: 'Skipped feedback-widget detection (no package.json).' }];
  if (depsMatch(names, FEEDBACK_WIDGET_SIGNATURES)) return [];
  return [{ check: 'feedback_widget_present', title: 'No user-feedback widget detected', severity: VISION_ABSENCE_SEVERITY, detail: 'package.json has no feedback-widget SDK (Sentry feedback / LogRocket / FullStory / Hotjar / equivalent). Chairman Vision-Compliance mandate: ship a user-feedback channel.' }];
}

/**
 * Vision Compliance — error_capture_wired: detect an error-capture SDK.
 * Absence is the failure (chairman mandate).
 */
export async function scanErrorCapture(repoDir) {
  const { names, ok } = await readPackageDeps(repoDir);
  if (!ok) return [{ check: 'error_capture_wired', title: 'No package.json — error capture undetectable', severity: 'info', detail: 'Skipped error-capture detection (no package.json).' }];
  if (depsMatch(names, ERROR_CAPTURE_SIGNATURES)) return [];
  return [{ check: 'error_capture_wired', title: 'No error-capture SDK detected', severity: VISION_ABSENCE_SEVERITY, detail: 'package.json has no error-capture SDK (Sentry / Bugsnag / Rollbar / Datadog RUM / equivalent). Chairman Vision-Compliance mandate: wire error capture.' }];
}

/**
 * Main analysis function for S20 Code Quality Gate.
 */
export async function analyzeStage20CodeQuality(params) {
  const { stage19Data, ventureName, ventureId, supabase, logger = console } = params;

  logger.info?.(`[S20-CodeQuality] Starting code quality gate for ${ventureName || 'unknown'}`);

  // Get GitHub repo URL.
  //
  // The original implementation here read `venture_resources.github_repo` as a
  // flat column — that schema never shipped. The migration that landed
  // (`supabase/migrations/20260330_create_venture_resources.sql`,
  // SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-B) is row-per-resource:
  // each external resource is its own row with `resource_type` enum +
  // `resource_identifier` URL/path. The flat-column query always returned
  // "column does not exist" and silently fell through to the stage19Data
  // fallback (which never carries a github URL either), so S20 effectively
  // returned `verdict='FAIL'` with "No GitHub repo URL found" for every venture
  // since the redesign shipped (PR #3209, 2026-04-22). Surfaced 2026-04-29
  // during the LexiGuard S19→S20 pre-approval review.
  // SD-FDBK-FIX-STAGE-REPOURL-RESOLUTION-001: resolve the repo URL by evaluating
  // candidates in precedence order and taking the FIRST that is a valid GitHub
  // URL after normalizing `owner/repo` shorthand. Previously the first *truthy*
  // candidate was taken unconditionally, so a shorthand resource_identifier
  // (written that way by venture-provisioner.js) shadowed a valid
  // ventures.repo_url and permanently FAILed S20. normalizeRepoUrl +
  // isSafeRepoUrl keep the anti-shell-injection guard authoritative.
  let repoUrl = null;
  let fallbackRawUrl = null;
  const considerCandidate = (raw) => {
    if (typeof raw !== 'string' || !raw) return;
    if (fallbackRawUrl === null) fallbackRawUrl = raw;
    if (repoUrl) return;
    const normalized = normalizeRepoUrl(raw);
    if (isSafeRepoUrl(normalized)) repoUrl = normalized;
  };

  if (supabase && ventureId) {
    // Primary: canonical row-per-resource registry
    const { data: resourceRow } = await supabase
      .from('venture_resources')
      .select('resource_identifier')
      .eq('venture_id', ventureId)
      .eq('resource_type', 'github_repo')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    considerCandidate(resourceRow?.resource_identifier);

    // Secondary: legacy slot on the ventures table. Queried whenever the primary
    // did not yield a VALID URL (not merely a falsy one), so a malformed resource
    // row no longer shadows a valid ventures.repo_url.
    if (!repoUrl) {
      const { data: ventureRow } = await supabase
        .from('ventures')
        .select('repo_url')
        .eq('id', ventureId)
        .maybeSingle();
      considerCandidate(ventureRow?.repo_url);
    }
  }

  // Tertiary fallback: stage19Data may carry it on some venture-pipeline paths.
  if (!repoUrl && stage19Data) {
    considerCandidate(stage19Data.github_repo);
    considerCandidate(stage19Data.repo_url);
    considerCandidate(stage19Data.__byType?.build_mvp_build?.github_repo);
  }

  // If no candidate produced a valid GitHub URL, fall back to the first raw
  // candidate so cloneRepo() surfaces the existing "refused to clone" FAIL for
  // genuinely malformed data rather than silently downgrading to the no-repo
  // advisory (unchanged terminal behavior).
  if (!repoUrl && fallbackRawUrl) {
    repoUrl = fallbackRawUrl;
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
    // SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-3): install dependencies into the
    // sandboxed clone BEFORE the checks run. Without node_modules, `npx eslint`
    // produced empty output (→ false "No ESLint config found") and `npm test`
    // failed for missing modules (→ spurious HIGH "Test suite failed") on EVERY
    // venture. The manager is auto-detected from the lockfile and the install is
    // routed through sandbox-driver.installArgsFor so --ignore-scripts (the
    // supply-chain RCE guard) is preserved. Best-effort: never throws.
    const packageManager = detectPackageManager(clone.dir);
    logger.info?.(`[S20-CodeQuality] Detected package manager: ${packageManager}; installing dependencies (--ignore-scripts)`);
    const install = await installDependencies(clone.dir, packageManager);
    if (!install.ran) {
      logger.warn?.(`[S20-CodeQuality] Dependency install did not complete (${install.error || 'unknown'}); lint/test will self-report "could not run".`);
    }

    // SD-LEO-INFRA-STAGE-CODE-QUALITY-001: run all 8 checks (4 code-review +
    // 2 QA + 2 Vision-Compliance). The 4 new checks are package.json-based and
    // emit canonical category names directly.
    const [
      auditFindings, secretFindings, lintFindings, testFindings,
      unitFindings, e2eFindings, feedbackFindings, errorCaptureFindings,
    ] = await Promise.all([
      runNpmAudit(clone.dir, packageManager),
      runSecretScan(clone.dir),
      runLintCheck(clone.dir),
      runTestSuite(clone.dir, packageManager, install),
      detectUnitTests(clone.dir),
      detectE2eTests(clone.dir),
      scanFeedbackWidget(clone.dir),
      scanErrorCapture(clone.dir),
    ]);

    const allFindings = [
      ...auditFindings, ...secretFindings, ...lintFindings, ...testFindings,
      ...unitFindings, ...e2eFindings, ...feedbackFindings, ...errorCaptureFindings,
    ];

    // FR-D AC-4.4: stamp every finding with sandbox provenance so downstream
    // consumers (FR-B persistence, FR-F aggregator) can reproduce the run.
    const sandboxProvenance = {
      cwd: clone.dir,
      env_allowlist: SANDBOX_ENV_KEYS,
      install_command: INSTALL_COMMAND,
    };
    for (const f of allFindings) {
      f.sandbox = sandboxProvenance;
    }

    // SD-LEO-INFRA-STAGE-ANALYZER-ADD-001: append the four DB-sourced + env-based
    // categories (uat_test, uat_signoff, bug_report, capability). These are NOT
    // products of the cloned repo, so they carry no sandbox provenance and are
    // collected after the repo-finding stamping loop. They participate in the
    // verdict (a real UAT failure / RED signoff / missing required capability
    // legitimately drives WARN/FAIL) and flow through adaptLegacyBatch via the new
    // LEGACY_CHECK_MAP identity entries. collectNonRepoFindings is best-effort and
    // never throws.
    const nonRepoFindings = await collectNonRepoFindings({ supabase, ventureId, logger });
    allFindings.push(...nonRepoFindings);
    const nonRepoCount = (check) => nonRepoFindings.filter((f) => f.check === check).length;

    // Determine verdict
    const hasCritical = allFindings.some(f => f.severity === 'critical');
    const hasHigh = allFindings.some(f => f.severity === 'high');
    const verdict = hasCritical ? 'FAIL' : hasHigh ? 'WARN' : 'PASS';

    // FR-A produces canonical-shape findings alongside the legacy array.
    // FR-B plumbs canonical_findings into the venture_quality_findings writer.
    const adapted = ventureId
      ? adaptLegacyBatch(allFindings, { venture_id: ventureId })
      : { canonical: [], skipped: allFindings, hashes: new Set() };

    const persistResult = await persistAnalyzerFindings(supabase, ventureId, adapted);

    return {
      verdict,
      repo_url: repoUrl,
      venture_name: ventureName,
      findings: allFindings,
      canonical_findings: adapted.canonical,
      canonical_skipped_count: adapted.skipped.length,
      persistence: persistResult,
      sandbox: sandboxProvenance,
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
          unit_test: unitFindings.length,
          e2e_test: e2eFindings.length,
          feedback_widget_present: feedbackFindings.length,
          error_capture_wired: errorCaptureFindings.length,
          uat_test: nonRepoCount('uat_test'),
          uat_signoff: nonRepoCount('uat_signoff'),
          bug_report: nonRepoCount('bug_report'),
          capability: nonRepoCount('capability'),
        },
      },
      checks_run: CHECK_TYPES.length,
    };
  } finally {
    // FR-D: invoke sandbox cleanup (idempotent — sandbox-driver guards via cleanedUp flag).
    // Replaces the inline rm(clone.tempRoot,...) call so cleanup goes through the
    // canonical sandbox-driver path even if cloneRepo internals change later.
    try { clone.sandboxHandle?.cleanup(); } catch { /* best-effort; sandbox-driver swallows internally */ }
  }
}

/**
 * FR-B: best-effort persistence of canonical findings into venture_quality_findings.
 *
 * Failures here must NOT fail the analyzer. The writer relies on UNIQUE(venture_id,
 * finding_hash) for idempotency, so re-invocation with the same canonical batch is
 * a no-op at the row-count level. audit_log emission is itself try/catch-wrapped —
 * observability failure is silent (mirrors capability-gate.js:107-109).
 *
 * Exported so unit tests can drive the persistence path without standing up the
 * full analyzer pipeline (cloneRepo + 4 quality checks).
 *
 * @param {Object|null} supabase - service-role client (optional; null skips cleanly)
 * @param {string|null} ventureId - venture UUID (required for audit_log entity_id)
 * @param {{canonical: Array, skipped: Array}} adapted - output of adaptLegacyBatch
 * @returns {Promise<{written:number, errors:Array, skipped_count:number, skipped_reason?:string}>}
 */
export async function persistAnalyzerFindings(supabase, ventureId, adapted) {
  const persistResult = {
    written: 0,
    errors: [],
    skipped_count: 0,
  };

  if (!supabase) {
    persistResult.skipped_reason = 'no_supabase_client';
    return persistResult;
  }

  if (!adapted || !Array.isArray(adapted.canonical) || adapted.canonical.length === 0) {
    return persistResult;
  }

  try {
    const { writeFindingsBatch } = await import('../../quality-findings/writer.js');
    const r = await writeFindingsBatch(supabase, adapted.canonical);
    persistResult.written = r.written;
    persistResult.errors = r.errors;
    persistResult.skipped_count = r.errors.length;
  } catch (err) {
    persistResult.errors.push({ scope: 'persistence-toplevel', error: err?.message || String(err) });
  }

  try {
    await supabase.from('audit_log').insert({
      event_type: 'venture_quality_findings.persist',
      entity_type: 'venture',
      entity_id: ventureId,
      severity: persistResult.errors.length === 0 ? 'info' : 'warning',
      created_by: 'stage-20-code-quality-analyzer',
      metadata: {
        inserted_count: persistResult.written,
        skipped_count: persistResult.skipped_count,
        error_count: persistResult.errors.length,
        hash_schema_version: 'fnv1a-16',
      },
    });
  } catch { /* observability failure is silent */ }

  return persistResult;
}

function buildNoRepoReport(ventureName) {
  // SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-4 (2026-05-03): missing-precondition
  // returns verdict=BLOCKED, distinct from FAIL so the advance-writer's
  // verdict-block can route operators back to S19 (no override path) instead
  // of treating it as a real critical finding (which would offer override).
  return {
    verdict: 'BLOCKED',
    repo_url: null,
    venture_name: ventureName,
    blocked_reason: 'missing_github_repo_precondition',
    findings: [{ check: 'precondition', title: 'No GitHub repo URL registered for this venture', severity: 'critical', detail: 'S19 must complete and register github_repo in venture_resources before S20 can validate. Operator: return to Stage 19 (no override available for missing precondition).' }],
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

export { CHECK_TYPES, SEVERITY_LEVELS, VERDICT_OPTIONS, DEFERRED_CANONICAL_CATEGORIES };
