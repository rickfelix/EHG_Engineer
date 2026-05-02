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
import { writeFile, lstat, unlink } from 'fs/promises';
import path from 'path';
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
import { createSandboxDir, buildEnvAllowlist } from '../../quality-findings/sandbox-driver.js';

const execAsync = promisify(exec);

// FR-D: snapshot the allowlist once per module load. Subprocess env is built
// from this list — parent process.env is filtered, secrets do not leak.
const SANDBOX_ENV = buildEnvAllowlist(process.env);
const SANDBOX_ENV_KEYS = Object.keys(SANDBOX_ENV).sort();
const INSTALL_COMMAND = 'npm install --ignore-scripts (via sandbox .npmrc)';

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
function isSafeRepoUrl(url) {
  if (typeof url !== 'string' || url.length > 512) return false;
  if (/[$`;|&><\\n\\r"'\s]/.test(url)) return false;
  return SAFE_REPO_URL_RE.test(url);
}

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
 * Run npm audit on cloned repo.
 */
async function runNpmAudit(repoDir) {
  const findings = [];
  try {
    // Check if package.json exists (env stripped + scoped to repoDir)
    await execAsync('test -f package.json', { cwd: repoDir, env: SANDBOX_ENV, timeout: 5000 });
    const { stdout } = await execAsync('npm audit --json 2>/dev/null || true', {
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
 */
async function runLintCheck(repoDir) {
  const findings = [];
  try {
    const { stdout } = await execAsync(
      'npx eslint . --format json --max-warnings 100 2>/dev/null || true',
      { cwd: repoDir, env: SANDBOX_ENV, timeout: 30000 }
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

    if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      try {
        await execAsync('npm test 2>&1', { cwd: repoDir, env: SANDBOX_ENV, timeout: 60000 });
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
  let repoUrl = null;
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
    repoUrl = resourceRow?.resource_identifier || null;

    // Secondary: legacy slot on the ventures table (older provisioning paths
    // populated this directly; kept as a fallback for backward-compat).
    if (!repoUrl) {
      const { data: ventureRow } = await supabase
        .from('ventures')
        .select('repo_url')
        .eq('id', ventureId)
        .maybeSingle();
      repoUrl = ventureRow?.repo_url || null;
    }
  }

  // Tertiary fallback: stage19Data may carry it on some venture-pipeline paths.
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
