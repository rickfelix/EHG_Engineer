/**
 * CROSS_REPO_STAGE_CONFIG_DRIFT — PLAN-TO-LEAD gate
 * SD-FDBK-INFRA-SYSTEMIC-CROSS-REPO-001
 *
 * THE GAP THIS CLOSES: the `venture_stages` SSOT (EHG_Engineer DB) drives a GENERATED file
 * in the sibling `ehg` repo, `ehg/src/config/venture-workflow.ts`. A CI job
 * (.github/workflows/venture-stages-drift-guard.yml, currently advisory/continue-on-error)
 * enforces byte-parity via `node scripts/generate-stage-config.cjs --check`. But that regen
 * step is INVISIBLE to LEO — no handoff gate runs it — so a worker who changes the stage SSOT
 * reaches LEAD_FINAL believing done while the cross-repo merge is structurally blocked by a
 * stale ehg file. This gate makes the drift VISIBLE to LEO at PLAN-TO-LEAD (the "believing
 * done" checkpoint), before LEAD-FINAL.
 *
 * FLEET-SAFE BY DESIGN (the cross-repo dependency-blocks lesson):
 *  - SCOPED BLOCK: only BLOCK when THIS SD touched stage-config SSOT inputs AND drift is real.
 *    Drift on an UNRELATED SD (pre-existing, advisory-mode) is surfaced as a WARN, never a
 *    block — one stale artifact must not wedge the whole fleet.
 *  - FAIL-OPEN: any EXECUTION error (DB unreachable, sibling repo absent, generator throws,
 *    git error) returns passed:true + warning. Unavailability never hard-blocks.
 *  - RELEVANCE FAIL-SAFE: if changed-file detection itself errors, treat the SD as RELEVANT
 *    so a parse error cannot silently downgrade a real regression from BLOCK to WARN.
 *
 * v1 SCOPE / KNOWN LIMIT (deferred to parts b/c of the SD): `--check` and the sibling
 * git-status sub-check read the LOCAL sibling working tree, so "committed locally but not
 * pushed/merged" still slips through. v1 catches the dominant failure mode (a stale/uncommitted
 * sibling file). Push/merge-landing enforcement is the deferred `related_prs` + landing-order work.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const GATE_NAME = 'CROSS_REPO_STAGE_CONFIG_DRIFT';

/** Changed-file paths (relative, forward-slash) that ALWAYS mark an SD stage-config-relevant. */
export const SSOT_INPUT_FILES = [
  'scripts/generate-stage-config.cjs',
  'lib/proving-companion/stage-config.js',
  'src/config/venture-workflow.ts', // if the sibling artifact is edited from within this repo's tree
];

/** A changed migration is relevant only if its body references the venture_stages SSOT table. */
const MIGRATION_DIR = 'database/migrations/';
const VENTURE_STAGES_RE = /venture_stages/i;

/**
 * Classify the exit/output of `generate-stage-config.cjs --check` into drift vs execution-error.
 * Real drift emits "CHECK FAILED: ... out of date ..." / "... byte-parity broken". An execution
 * error (DB down, sibling absent, generator threw) exits non-zero WITHOUT those drift messages.
 * Pure + exported for unit testing.
 * @returns {{driftDetected:boolean, executionError:boolean}}
 */
export function classifyCheckOutput(exitCode, output) {
  const text = String(output || '');
  if (exitCode === 0) return { driftDetected: false, executionError: false };
  const isDrift = /CHECK FAILED:[^\n]*(out of date|byte-parity)/i.test(text);
  if (isDrift) return { driftDetected: true, executionError: false };
  // non-zero but not a recognized drift message -> treat as an execution problem (fail-open).
  return { driftDetected: false, executionError: true };
}

/**
 * Decide the final gate verdict from the four boolean signals. Pure + exported for testing.
 *  - executionError -> FAIL-OPEN (pass + warning), regardless of anything else.
 *  - drift OR sibling-uncommitted, AND relevant -> BLOCK.
 *  - drift OR sibling-uncommitted, but NOT relevant -> WARN (pass + warning).
 *  - otherwise -> clean PASS.
 * @returns {{passed:boolean, outcome:'PASS'|'BLOCK'|'WARN'|'FAIL_OPEN', reason:string}}
 */
export function decideVerdict({ relevant, driftDetected, siblingUncommitted, executionError }) {
  if (executionError) {
    return { passed: true, outcome: 'FAIL_OPEN', reason: 'Could not evaluate cross-repo stage-config parity (execution error) — failing open.' };
  }
  const hasDrift = Boolean(driftDetected || siblingUncommitted);
  if (!hasDrift) {
    return { passed: true, outcome: 'PASS', reason: 'venture_stages SSOT and the sibling ehg venture-workflow.ts are in sync.' };
  }
  if (relevant) {
    return { passed: false, outcome: 'BLOCK', reason: 'This SD changed stage-config SSOT inputs and the sibling ehg venture-workflow.ts is stale/uncommitted — the cross-repo merge would be blocked by drift CI.' };
  }
  return { passed: true, outcome: 'WARN', reason: 'Pre-existing stage-config drift detected, but this SD did not touch stage-config inputs — surfaced as a warning, not blocking unrelated work.' };
}

const BLOCK_REMEDIATION =
  'Cross-repo stage-config drift. In EHG_Engineer run `npm run venture-stages:generate` (node scripts/generate-stage-config.cjs --write), then COMMIT the regenerated `ehg/src/config/venture-workflow.ts` in the sibling ehg repo and open/merge its PR before LEAD-FINAL. Verify with `npm run venture-stages:check`.';

// ---- default (real) I/O helpers; injectable via deps for unit tests -------------------------

function defaultGitRoot(ctx) {
  if (ctx?.gitContext?.gitRoot) return ctx.gitContext.gitRoot;
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 10000 }).trim();
  } catch {
    return process.cwd();
  }
}

function defaultChangedFiles(rootDir) {
  // Resolve a base ref, then list changed files for this SD's branch. Throws on total failure
  // so the caller can apply the relevance fail-safe (treat as relevant).
  const refs = ['origin/main', 'main', 'HEAD~10'];
  for (const ref of refs) {
    try {
      const out = execSync(`git diff --name-only ${ref}...HEAD`, { cwd: rootDir, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch { /* try next ref */ }
  }
  throw new Error('git diff failed for all candidate base refs');
}

function defaultResolveSiblingRepo(rootDir) {
  // env override (mirrors the CI) -> registry -> ../ehg fallback.
  if (process.env.EHG_APP_PATH) return process.env.EHG_APP_PATH;
  try {
    const { resolveRepoPath } = require('../../../../../../lib/repo-paths.cjs');
    const p = resolveRepoPath('ehg');
    if (p) return p;
  } catch { /* fall through */ }
  return path.resolve(rootDir, '..', 'ehg');
}

function defaultRunCheck(rootDir) {
  try {
    const out = execSync('node scripts/generate-stage-config.cjs --check', { cwd: rootDir, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, output: out };
  } catch (err) {
    // execSync throws on non-zero; gather stdout+stderr for classification.
    const output = `${err.stdout || ''}\n${err.stderr || ''}\n${err.message || ''}`;
    const exitCode = typeof err.status === 'number' ? err.status : 1;
    return { exitCode, output };
  }
}

function defaultSiblingUncommitted(siblingRepo) {
  // Returns { present, uncommitted }. Absent sibling repo -> present:false (caller fails open
  // only if --check also could not run; sibling-absence alone is an execution concern).
  const wf = path.join(siblingRepo, 'src', 'config', 'venture-workflow.ts');
  if (!existsSync(siblingRepo) || !existsSync(wf)) return { present: false, uncommitted: false };
  try {
    const out = execSync('git status --porcelain -- src/config/venture-workflow.ts', { cwd: siblingRepo, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { present: true, uncommitted: out.trim().length > 0 };
  } catch {
    return { present: false, uncommitted: false }; // git error in sibling -> treat as not-evaluable
  }
}

/**
 * Determine whether the SD's changed files touch stage-config SSOT inputs.
 * relevant if: a known SSOT input file changed, OR a changed migration body references
 * venture_stages. readMigration(rel) returns the file body (or null). Pure-ish + exported.
 */
export function isStageConfigRelevant(changedFiles, readMigration) {
  const files = (changedFiles || []).map((f) => f.replace(/\\/g, '/'));
  for (const f of files) {
    if (SSOT_INPUT_FILES.some((s) => f === s || f.endsWith('/' + s))) return true;
  }
  for (const f of files) {
    if (f.startsWith(MIGRATION_DIR) && /\.sql$/i.test(f)) {
      let body = null;
      try { body = readMigration(f); } catch { body = null; }
      if (body && VENTURE_STAGES_RE.test(body)) return true;
    }
  }
  return false;
}

/**
 * Factory for the gate. `deps` lets tests inject all I/O.
 */
export function createCrossRepoStageConfigDriftGate(supabase, deps = {}) {
  const {
    gitRoot = defaultGitRoot,
    changedFiles = defaultChangedFiles,
    resolveSibling = defaultResolveSiblingRepo,
    runCheck = defaultRunCheck,
    siblingStatus = defaultSiblingUncommitted,
    readMigration = null, // resolved per-rootDir below if not injected
  } = deps;

  return {
    name: GATE_NAME,
    required: true, // gate runs every PLAN-TO-LEAD; it only BLOCKS on a relevant SD's real drift
    validator: async (ctx) => {
      const rootDir = gitRoot(ctx);
      const readMig = readMigration || ((rel) => readFileSync(path.join(rootDir, rel), 'utf8'));

      // 1) Relevance — fail-safe to RELEVANT if detection errors.
      let relevant;
      try {
        const files = changedFiles(rootDir);
        relevant = isStageConfigRelevant(files, readMig);
      } catch {
        relevant = true; // must-fix #1: a detection error must not downgrade BLOCK -> WARN
      }

      // 2) Parity check + sibling-uncommitted probe.
      let driftDetected = false;
      let executionError = false;
      let siblingUncommitted = false;
      const details = {};
      try {
        const { exitCode, output } = runCheck(rootDir);
        const cls = classifyCheckOutput(exitCode, output);
        driftDetected = cls.driftDetected;
        executionError = cls.executionError;
        details.check_exit = exitCode;

        const siblingRepo = resolveSibling(rootDir);
        const sib = siblingStatus(siblingRepo);
        details.sibling_present = sib.present;
        if (sib.present) {
          siblingUncommitted = sib.uncommitted;
        } else if (!driftDetected) {
          // sibling repo not resolvable AND --check did not positively detect drift -> fail open
          executionError = true;
        }
      } catch {
        executionError = true; // any unexpected throw -> fail open
      }

      // 3) Decide.
      const verdict = decideVerdict({ relevant, driftDetected, siblingUncommitted, executionError });
      details.relevant = relevant;
      details.drift_detected = driftDetected;
      details.sibling_uncommitted = siblingUncommitted;
      details.execution_error = executionError;
      details.outcome = verdict.outcome;

      const isBlock = verdict.outcome === 'BLOCK';
      return {
        passed: verdict.passed,
        score: verdict.passed ? 100 : 0,
        max_score: 100,
        issues: isBlock ? [`${GATE_NAME}: ${verdict.reason}`] : [],
        warnings: verdict.passed && verdict.outcome !== 'PASS' ? [`${GATE_NAME} (${verdict.outcome}): ${verdict.reason}`] : [],
        details,
        ...(isBlock ? { remediation: BLOCK_REMEDIATION } : {}),
      };
    },
  };
}

export default createCrossRepoStageConfigDriftGate;
