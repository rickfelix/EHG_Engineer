/**
 * Phase 3: E2E Test Execution
 *
 * Executes Playwright E2E tests and handles cached results.
 *
 * Extracted from TESTING sub-agent v3.0
 * SD: SD-LEO-REFAC-TESTING-INFRA-001
 */

import { spawn } from 'child_process';
import { mkdirSync, readFileSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import {
  suggestTroubleshootingTactics,
  logTroubleshootingTactics
} from '../utils/troubleshooting.js';
import { normalizePhaseToken } from '../../../sub-agent-executor/phase-token.js';
import { computeReposForSD } from '../../repo-target-resolver.js';
import { resolveEvaluatedCommitSha } from '../../../sub-agent-executor/results-storage.js';

const DEFAULT_E2E_TIMEOUT_MS = 30 * 60 * 1000;
const PLAYWRIGHT_CONFIG_CANDIDATES = ['playwright.config.js', 'playwright.config.ts', 'playwright.config.mjs'];

/**
 * Execute E2E tests
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Test execution results
 */
export async function executeE2ETests(sdId, options, supabase) {
  console.log('   🎭 Executing Playwright E2E tests...');

  const results = {
    tests_executed: 0,
    tests_passed: 0,
    failed_tests: 0,
    skipped_tests: 0,
    execution_time_ms: 0,
    failures: [],
    report_url: null,
    troubleshooting_tactics: []
  };

  try {
    // SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-4): scoped mode is an ALTERNATIVE evidence path,
    // checked before --full-e2e -- a caller that supplies touched paths is explicitly asking
    // for the narrower run regardless of the full-e2e flag's presence.
    if (Array.isArray(options.e2e_scope_touched_paths) && options.e2e_scope_touched_paths.length > 0) {
      console.log('      🎯 Scoped E2E mode requested — running only specs matching touched paths');
      const scopedResults = await runScopedE2ESuite(sdId, options.e2e_scope_touched_paths, options);
      Object.assign(results, scopedResults);
      const icon = results.failed_tests === 0 && !results.error ? '✅' : '❌';
      console.log(`      ${icon} Scoped E2E: ${results.tests_passed}/${results.tests_executed} passed, ${results.failed_tests} failed (${results.included_specs?.length ?? 0} of ${(results.included_specs?.length ?? 0) + (results.excluded_count ?? 0)} specs included)`);
    } else if (options.full_e2e) {
      console.log('      🚀 Full E2E suite requested — executing Playwright');
      // SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-2 scope): only activate multi-repo
      // resolution when computeReposForSD(sdRow) resolves to 2+ DISTINCT (deduplicated)
      // localPaths. Otherwise the single-repoPath path below runs completely unchanged --
      // this is what keeps AC-2.2/TS-4 (byte-identical single-repo behavior) true, since the
      // two resolvers' differing unresolvable-target_application fallbacks never need
      // reconciling for the single-repo case.
      const distinctRepos = options.sdRow ? dedupeRepos(computeReposForSD(options.sdRow)) : [];
      const e2eResults = distinctRepos.length >= 2
        ? await runMultiRepoE2ESuite(sdId, distinctRepos, options)
        : await runFullE2ESuite(sdId, options);
      Object.assign(results, e2eResults);
      const icon = results.failed_tests === 0 && !results.error ? '✅' : '❌';
      console.log(`      ${icon} E2E: ${results.tests_passed}/${results.tests_executed} passed, ${results.failed_tests} failed, ${results.skipped_tests} skipped (${Math.round(results.execution_time_ms / 1000)}s)`);
    } else {
      console.log('      ℹ️  Full E2E suite not requested (use --full-e2e flag)');
      console.log('      💡 Checking for existing test evidence...');

      // Check database for previous test results
      const cachedResults = await getCachedTestResults(sdId, supabase, options.repoPath);

      if (cachedResults) {
        Object.assign(results, cachedResults);
      } else {
        console.log('      ⚠️  No previous test evidence found');
        console.log('      💡 Run tests with --full-e2e flag to execute E2E suite');
      }
    }
  } catch (error) {
    console.error(`      ❌ Test execution error: ${error.message}`);
    results.error = error.message;

    // Provide troubleshooting guidance
    results.troubleshooting_tactics = suggestTroubleshootingTactics(error);
    logTroubleshootingTactics(results.troubleshooting_tactics);
  }

  return results;
}

/**
 * Detect whether a repo has E2E/Playwright infrastructure at all.
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D: distinguishes "no infra exists"
 * (e2e-not-applicable) from "infra exists but tests failed/were never run" (BLOCKED) --
 * the pre-fix code treated both identically. Checks are scoped to repoPath, never cwd.
 * @param {string} repoPath - absolute path to the target repo
 * @returns {boolean} true if any playwright config, tests/e2e dir, or package.json
 *   scripts["test:e2e"] is present
 */
export function hasE2EInfra(repoPath) {
  if (PLAYWRIGHT_CONFIG_CANDIDATES.some((f) => existsSync(path.join(repoPath, f)))) return true;
  if (existsSync(path.join(repoPath, 'tests', 'e2e'))) return true;
  try {
    const pkgPath = path.join(repoPath, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && typeof pkg.scripts['test:e2e'] === 'string') return true;
    }
  } catch { /* malformed package.json — treat as no infra, not a crash */ }
  return false;
}

/**
 * Detect the actual Playwright config filename present in a repo.
 *
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-6): runFullE2ESuite previously
 * hardcoded --config=playwright.config.js, which hasE2EInfra's own candidate list
 * (js/ts/mjs) never guaranteed to exist -- the EHG repo has NO .js config (only .ts
 * variants), so hasE2EInfra correctly reports infra present while the hardcoded spawn
 * would fail with a missing-config error. Reuses the SAME candidate list hasE2EInfra
 * checks, so "has infra" and "config filename found" can never disagree.
 * @param {string} repoPath - absolute path to the target repo
 * @returns {string|null} the first matching config filename, or null if none found
 *   (caller should not spawn Playwright without a resolved config)
 */
export function detectPlaywrightConfig(repoPath) {
  for (const f of PLAYWRIGHT_CONFIG_CANDIDATES) {
    if (existsSync(path.join(repoPath, f))) return f;
  }
  return null;
}

/**
 * Run the full Playwright E2E suite for real and parse the JSON report.
 * Was a simulated no-op (hard-coded 10/10 pass) until QF-20260713-266.
 */
export async function runFullE2ESuite(sdId, options = {}) {
  // SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D: a silent process.cwd() fallback here
  // would run Playwright against the ORCHESTRATOR's own repo (which has its own
  // playwright.config.js) whenever upstream repoPath resolution genuinely failed --
  // producing a false PASS/misattributed results with no error surfaced (deep-tier
  // adversarial review finding). Fail loudly instead: repoPath must be resolved upstream.
  if (!options.repoPath) {
    return {
      error: 'runFullE2ESuite called without options.repoPath — repoPath resolution failed upstream; refusing to fall back to process.cwd() (would test the wrong repo)',
      tests_executed: 0,
      tests_passed: 0,
      failed_tests: 0,
      skipped_tests: 0,
      execution_time_ms: 0,
      failures: [],
      report_url: null
    };
  }
  const repoPath = options.repoPath;

  // SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D FR-2: a zero-infra repo (e.g. altifyai:
  // no tests/e2e, no test:e2e script) must not be treated as a test failure.
  if (!hasE2EInfra(repoPath)) {
    return {
      e2e_not_applicable: true,
      reason: `No E2E/Playwright infrastructure found in ${repoPath} (no playwright config, no tests/e2e dir, no package.json test:e2e script)`,
      tests_executed: 0,
      tests_passed: 0,
      failed_tests: 0,
      skipped_tests: 0,
      execution_time_ms: 0,
      failures: [],
      report_url: null
    };
  }

  // SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-6): detect the config filename that
  // actually exists in THIS repo rather than hardcoding playwright.config.js -- the EHG repo
  // has no .js config, only .ts variants, so a hardcoded literal would spawn against a
  // nonexistent file even though hasE2EInfra() correctly reported infra present. If null,
  // hasE2EInfra() passed above via tests/e2e dir or package.json test:e2e script (not a config
  // file) -- there is genuinely no playwright.config.* to pass, so --config is omitted and
  // Playwright's own default resolution applies.
  const configFile = detectPlaywrightConfig(repoPath);

  // Absolute path: with cwd:repoPath added to spawn() below, a relative evidenceDir would
  // resolve under repoPath inside the child process while the readFileSync below still
  // resolved under the parent's cwd -- ENOENT (found during PLAN-phase testing-agent review).
  const evidenceDir = path.resolve(repoPath, 'tests', 'e2e', 'evidence', String(sdId));
  mkdirSync(evidenceDir, { recursive: true });
  const jsonReportPath = path.join(evidenceDir, 'playwright-results.json');
  const timeoutMs = options.e2e_timeout_ms || DEFAULT_E2E_TIMEOUT_MS;
  const startedAt = Date.now();

  const playwrightArgs = ['playwright', 'test', ...(configFile ? [`--config=${configFile}`] : []), '--reporter=json'];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn('npx', playwrightArgs, {
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReportPath },
      cwd: repoPath,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32'
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`E2E suite timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });

  const report = JSON.parse(readFileSync(jsonReportPath, 'utf8'));
  const stats = report.stats || {};
  const failures = [];
  for (const suite of report.suites || []) collectFailures(suite, failures);

  const parsed = {
    tests_executed: (stats.expected || 0) + (stats.unexpected || 0) + (stats.flaky || 0),
    tests_passed: (stats.expected || 0) + (stats.flaky || 0),
    failed_tests: stats.unexpected || 0,
    skipped_tests: stats.skipped || 0,
    execution_time_ms: Math.round(stats.duration || (Date.now() - startedAt)),
    failures: failures.slice(0, 20),
    report_url: jsonReportPath,
    // SECURITY review (SD-LEARN-FIX-LEARNING-IMPROVEMENT-005, evidence bdbe3d54): hashed from
    // the SAME parsed `report` object the counts above were just derived from -- a single read,
    // not a second readFileSync of jsonReportPath at stamp time. Matches computeArtifactSha's
    // own method (sha256 of the re-serialized parsed content, artifact-verification.js) so a
    // later comparison against that function's output is a genuine match, not a false mismatch.
    artifact_sha: createHash('sha256').update(JSON.stringify(report)).digest('hex')
  };
  // Non-zero exit with zero reported failures = config/infra error, never a pass
  if (exitCode !== 0 && parsed.failed_tests === 0) {
    parsed.error = `Playwright exited ${exitCode} with no failing tests in report — config/infra error, not a pass`;
  }
  return parsed;
}

/**
 * Deduplicate resolved repos by localPath.
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (AC-2.3): computeReposForSD's Tier-2
 * venture-repo fallback (getRepoPath -> ENGINEER_ROOT) can yield identical localPaths for
 * two different inputs -- these must count as ONE repo, not double-execute/double-count.
 * @param {Array<{githubRepo: string, localPath: string}>} repos
 * @returns {Array<{githubRepo: string, localPath: string}>}
 */
export function dedupeRepos(repos) {
  const seen = new Set();
  const out = [];
  for (const r of repos || []) {
    if (!r?.localPath || seen.has(r.localPath)) continue;
    seen.add(r.localPath);
    out.push(r);
  }
  return out;
}

/**
 * Run the E2E suite against every resolved repo that has infra, aggregating fail-closed.
 *
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-2/FR-3): explicit aggregation contract
 * — top-level fields are DERIVED (summed/concatenated), never Object.assign-clobbered by a
 * later repo's result, which is what let a no-infra repo's e2e_not_applicable flag silently
 * mask an earlier repo's real failure in a naive per-repo loop (found by TESTING sub-agent
 * PLAN-phase prospective review). e2e_not_applicable is true at the top level ONLY when
 * EVERY resolved repo lacks infra; otherwise repos with infra execute and ALL must pass.
 * @param {string} sdId - Strategic Directive ID
 * @param {Array<{githubRepo: string, localPath: string}>} repos - deduplicated, 2+ entries
 * @param {Object} options - base options (repoPath is overridden per-repo)
 * @returns {Promise<Object>} aggregated results with a `per_repo[]` breakdown
 */
export async function runMultiRepoE2ESuite(sdId, repos, options = {}) {
  const per_repo = [];
  for (const r of repos) {
    const result = await runFullE2ESuite(sdId, { ...options, repoPath: r.localPath });
    per_repo.push({ repoPath: r.localPath, githubRepo: r.githubRepo, ...result });
  }
  return aggregateE2EResults(per_repo);
}

/**
 * Pure aggregation contract for multi-repo E2E results — separated from
 * runMultiRepoE2ESuite so it is directly unit-testable with fake per_repo arrays,
 * without spawning Playwright.
 *
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-3): top-level fields are
 * DERIVED (summed/concatenated), never Object.assign-clobbered by a later repo's
 * result — this is what prevents a no-infra repo's e2e_not_applicable flag from
 * masking an earlier repo's real failure. e2e_not_applicable is true at the top
 * level ONLY when EVERY per_repo entry has it true; otherwise the derived
 * failed_tests count (fail-closed: any repo's failure fails the aggregate) governs.
 * @param {Array<Object>} per_repo - each entry is a runFullE2ESuite() result plus
 *   {repoPath, githubRepo}
 * @returns {Object} aggregated results with a `per_repo[]` breakdown
 */
export function aggregateE2EResults(per_repo) {
  // per_repo.length > 0 guard: Array.prototype.every() is vacuously true on an empty array,
  // which would make an empty per_repo fail-OPEN (e2e_not_applicable: true -> phase5 PASS@90)
  // -- the wrong default for a function whose whole purpose is fail-closed aggregation.
  const allNotApplicable = per_repo.length > 0 && per_repo.every((r) => r.e2e_not_applicable === true);

  const aggregate = {
    per_repo,
    tests_executed: per_repo.reduce((sum, r) => sum + (r.tests_executed || 0), 0),
    tests_passed: per_repo.reduce((sum, r) => sum + (r.tests_passed || 0), 0),
    failed_tests: per_repo.reduce((sum, r) => sum + (r.failed_tests || 0), 0),
    skipped_tests: per_repo.reduce((sum, r) => sum + (r.skipped_tests || 0), 0),
    execution_time_ms: per_repo.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0),
    failures: per_repo.flatMap((r) => (r.failures || []).map((f) => ({ ...f, repoPath: r.repoPath }))),
    report_url: per_repo.map((r) => r.report_url).filter(Boolean)
  };

  if (allNotApplicable) {
    aggregate.e2e_not_applicable = true;
    aggregate.reason = `No E2E/Playwright infrastructure found in any resolved repo: ${per_repo.map((r) => r.repoPath).join(', ')}`;
  } else {
    // A per-repo error (e.g. FR-6's missing-config case, before this fix would have applied)
    // must survive aggregation, never be silently dropped by a later successful repo.
    // runFullE2ESuite's own contract never sets both error and e2e_not_applicable on the
    // same result, so this is a plain find, not a defensive-but-misleading double-condition.
    const errored = per_repo.find((r) => r.error);
    if (errored) aggregate.error = `[${errored.repoPath}] ${errored.error}`;
  }

  return aggregate;
}

/** Recursively collect failed specs from a Playwright JSON-report suite. */
export function collectFailures(suite, failures) {
  for (const spec of suite.specs || []) {
    if (spec.ok === false) failures.push({ test: spec.title, file: spec.file, line: spec.line });
  }
  for (const child of suite.suites || []) collectFailures(child, failures);
}

/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-4): pure spec-selection contract for the scoped
 * TESTING mode. Deliberately CONSERVATIVE -- a touched path is matched to a spec file ONLY
 * when the touched path IS an e2e spec file itself (an SD that edits its own e2e spec), never
 * by a fuzzy "this source file smells related to that spec" heuristic. A guessed mapping that
 * silently excludes a genuinely-affected spec is worse than an honest, narrow inclusion set --
 * this SD builds the mode; whether a narrow-but-honest scoped run satisfies EXEC-TO-PLAN is the
 * separate, in-flight chairman ruling this function does not preempt.
 * @param {string[]} touchedPaths - paths the SD's diff touched, relative to repoPath
 * @param {string[]} allSpecFiles - every discovered e2e spec file, relative to repoPath
 * @returns {{included: string[], excludedCount: number}}
 */
export function resolveScopedSpecs(touchedPaths, allSpecFiles) {
  const normalize = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
  const touched = new Set((touchedPaths || []).map(normalize));
  const specs = (allSpecFiles || []).map(normalize);
  const included = specs.filter((spec) => touched.has(spec));
  return { included, excludedCount: specs.length - included.length };
}

/**
 * Recursively discover every *.spec.{js,ts,jsx,tsx} file under a directory, relative to
 * repoPath. Mirrors Playwright's own default spec-file convention (this SD does not touch
 * playwright.config.js's own test-discovery logic, only which subset gets passed on the CLI).
 * @param {string} repoPath
 * @param {string} testDir - absolute path to the e2e test directory
 * @returns {string[]} paths relative to repoPath, forward-slash normalized
 */
export function discoverSpecFiles(repoPath, testDir) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // dir vanished mid-walk or unreadable -- not this function's failure mode to report
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.spec\.(js|ts|jsx|tsx)$/.test(entry.name)) {
        out.push(path.relative(repoPath, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(testDir);
  return out;
}

/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-4): run a NARROW subset of the E2E suite -- the
 * scoped TESTING mode. Never silently substitutes for a full-suite claim: the returned result
 * always carries {mode: 'scoped', touched_paths, included_specs, excluded_count} so a reader
 * can see exactly what extent was covered. An empty match (no touched path is itself a spec
 * file) returns zero-executed with scoped_no_matching_specs:true rather than spawning
 * Playwright against zero args (which would silently run the FULL suite -- Playwright treats no
 * positional file args as "run everything", the opposite of scoped).
 * @param {string} sdId
 * @param {string[]} touchedPaths - paths the SD's diff touched, relative to repoPath
 * @param {Object} options - same shape as runFullE2ESuite's options (repoPath required)
 * @returns {Promise<Object>}
 */
export async function runScopedE2ESuite(sdId, touchedPaths, options = {}) {
  if (!options.repoPath) {
    return {
      error: 'runScopedE2ESuite called without options.repoPath — refusing to fall back to process.cwd()',
      mode: 'scoped', touched_paths: touchedPaths || [], included_specs: [], excluded_count: 0,
      tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0, execution_time_ms: 0,
      failures: [], report_url: null
    };
  }
  const repoPath = options.repoPath;
  if (!hasE2EInfra(repoPath)) {
    return {
      e2e_not_applicable: true,
      reason: `No E2E/Playwright infrastructure found in ${repoPath}`,
      mode: 'scoped', touched_paths: touchedPaths || [], included_specs: [], excluded_count: 0,
      tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0, execution_time_ms: 0,
      failures: [], report_url: null
    };
  }

  const testDir = path.join(repoPath, 'tests', 'e2e');
  const allSpecFiles = discoverSpecFiles(repoPath, testDir);
  const { included, excludedCount } = resolveScopedSpecs(touchedPaths, allSpecFiles);

  const scopeMeta = { mode: 'scoped', touched_paths: touchedPaths || [], included_specs: included, excluded_count: excludedCount };

  if (included.length === 0) {
    return {
      ...scopeMeta,
      scoped_no_matching_specs: true,
      tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0, execution_time_ms: 0,
      failures: [], report_url: null
    };
  }

  const configFile = detectPlaywrightConfig(repoPath);
  const evidenceDir = path.resolve(repoPath, 'tests', 'e2e', 'evidence', String(sdId));
  mkdirSync(evidenceDir, { recursive: true });
  const jsonReportPath = path.join(evidenceDir, 'playwright-results-scoped.json');
  const timeoutMs = options.e2e_timeout_ms || DEFAULT_E2E_TIMEOUT_MS;
  const startedAt = Date.now();

  const playwrightArgs = ['playwright', 'test', ...(configFile ? [`--config=${configFile}`] : []), '--reporter=json', ...included];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn('npx', playwrightArgs, {
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReportPath },
      cwd: repoPath,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32'
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Scoped E2E run timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });

  const report = JSON.parse(readFileSync(jsonReportPath, 'utf8'));
  const stats = report.stats || {};
  const failures = [];
  for (const suite of report.suites || []) collectFailures(suite, failures);

  const parsed = {
    ...scopeMeta,
    tests_executed: (stats.expected || 0) + (stats.unexpected || 0) + (stats.flaky || 0),
    tests_passed: (stats.expected || 0) + (stats.flaky || 0),
    failed_tests: stats.unexpected || 0,
    skipped_tests: stats.skipped || 0,
    execution_time_ms: Math.round(stats.duration || (Date.now() - startedAt)),
    failures: failures.slice(0, 20),
    report_url: jsonReportPath,
    artifact_sha: createHash('sha256').update(JSON.stringify(report)).digest('hex')
  };
  if (exitCode !== 0 && parsed.failed_tests === 0) {
    parsed.error = `Playwright exited ${exitCode} with no failing tests in report — config/infra error, not a pass`;
  }
  return parsed;
}

/**
 * Get cached test results from database
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {string|null} [repoPath] - repo the CURRENT run evaluates, for commit-sha binding
 * @returns {Promise<Object|null>} Cached results or null
 */
export async function getCachedTestResults(sdId, supabase, repoPath = null) {
  // QF-20260809-097: the cache key omitted phase, so a BLOCKED verdict from an
  // earlier phase (e.g. PLAN, nothing implemented yet) got silently reused
  // within the 1h TTL by a later phase (e.g. EXEC) whose code IS implemented.
  // normalizePhaseToken is the SAME SSOT results-storage.js's write path uses
  // to derive/store the `phase` column -- a coarser LEAD/PLAN/EXEC-only bucket
  // would re-collapse sub-phase distinctions the write side deliberately keeps.
  const { data: sdRow } = await supabase
    .from('strategic_directives_v2')
    .select('current_phase')
    .eq('id', sdId)
    .maybeSingle();
  const currentPhase = normalizePhaseToken(sdRow?.current_phase);
  if (!currentPhase) return null;

  const { data: previousTest, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sd_id, sub_agent_code, phase, verdict, confidence, metadata, created_at')
    .eq('sd_id', sdId)
    .eq('sub_agent_code', 'TESTING')
    .eq('phase', currentPhase)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !previousTest) return null;

  // QF-20260901-544: this cache previously keyed ONLY on sd_id+phase+age, so a verdict from
  // BEFORE a code change was silently reused for up to an hour after the change. The
  // evaluated_commit_sha stamped by results-storage.js's canonical writer at PASS/FAIL time
  // must match the commit CURRENTLY under evaluation; a mismatch, or either side being
  // unresolvable, is a miss -- never a guess (same fails-toward-refusing-reuse posture as
  // verifyArtifact()/checkTestEvidence() elsewhere in this sub-agent).
  const cachedCommitSha = previousTest.metadata?.evaluated_commit_sha ?? null;
  const currentCommitSha = repoPath ? resolveEvaluatedCommitSha(repoPath) : null;
  if (!cachedCommitSha || !currentCommitSha || cachedCommitSha !== currentCommitSha) {
    console.log(`      🔄 Cached verdict commit mismatch (cached=${cachedCommitSha ?? 'unknown'}, current=${currentCommitSha ?? 'unresolvable'}) -- treating as a miss`);
    return null;
  }

  // Check if cached results are recent (within 1 hour)
  const testAge = Date.now() - new Date(previousTest.created_at).getTime();
  const oneHour = 60 * 60 * 1000;
  const isRecent = testAge < oneHour;

  console.log('      ✅ Found previous test execution');
  console.log(`         Verdict: ${previousTest.verdict}`);
  console.log(`         Date: ${previousTest.created_at}`);
  console.log(`         Age: ${Math.floor(testAge / 1000 / 60)} minutes ago`);

  if (!isRecent) {
    console.log('      ⏰ Cached results too old (> 1 hour)');
    console.log('      💡 Re-run tests with --full-e2e flag for fresh results');
    return null;
  }

  console.log('      ♻️  Using cached results (< 1 hour old)');

  // Extract test execution data with size validation
  const rawCachedData = previousTest.metadata?.findings?.phase3_execution || previousTest.metadata || {};
  const cachedDataSize = JSON.stringify(rawCachedData).length;
  const MAX_CACHE_SIZE = 50000; // 50 KB threshold

  let cachedData = rawCachedData;
  if (cachedDataSize > MAX_CACHE_SIZE) {
    console.log(`      ⚠️  Cached data too large (${Math.round(cachedDataSize / 1024)} KB > ${MAX_CACHE_SIZE / 1024} KB threshold)`);
    console.log('      💡 Extracting only essential fields to prevent bloat');
    cachedData = {
      tests_executed: rawCachedData.tests_executed || 0,
      tests_passed: rawCachedData.tests_passed || 0,
      failed_tests: rawCachedData.failed_tests || 0,
      _size_limited: true,
      _original_size_kb: Math.round(cachedDataSize / 1024)
    };
  }

  const results = {
    tests_executed: cachedData.tests_executed || 0,
    tests_passed: cachedData.tests_passed || 0,
    failed_tests: cachedData.failed_tests || 0,
    from_cache: true,
    cache_age_minutes: Math.floor(testAge / 1000 / 60),
    // QF-20260901-544: cache provenance, so a reused verdict is always distinguishable from a
    // fresh run and always states WHICH commit it was verified against.
    cache_provenance: { commit_sha: cachedCommitSha, cached_from_created_at: previousTest.created_at }
  };

  // QF/F2 SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-B
  // Do NOT fabricate a synthetic 1/1-passed from a bare prior PASS/CONDITIONAL_PASS
  // verdict that carried no real execution counts. Synthesizing tests_executed:1 from a
  // verdict-with-no-numbers manufactured evidence out of thin air, which let phase5
  // generateVerdict treat "we once said PASS" as "tests ran and passed". A verdict
  // without real execution counts is zero evidence: only the real cachedData counts
  // extracted above are carried forward; otherwise tests_executed stays 0 so phase5
  // correctly treats it as no-evidence (non-passing). Fail-soft: we only log.
  if (results.tests_executed === 0 && (previousTest.verdict === 'PASS' || previousTest.verdict === 'CONDITIONAL_PASS')) {
    console.log('      ⚠️  Cached verdict found but real execution counts are missing');
    console.log('      💡 Not fabricating synthetic results - leaving tests_executed:0 (no evidence)');
  }

  return results;
}
