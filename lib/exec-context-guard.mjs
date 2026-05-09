/**
 * lib/exec-context-guard.mjs
 *
 * SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — shared invariant module enforcing
 * execution-context preconditions before state-changing operations in
 * scripts/handoff.js, scripts/stale-session-sweep.cjs, and scripts/sd-start.js.
 *
 * Closes the post-merge worktree lifecycle bug cluster (3 prior witnesses):
 *   - d66a075d: handoff.js LEAD-FINAL crashed because cwd was a stale worktree
 *               whose branch had been deleted (`gh pr merge --delete-branch`),
 *               triggering an import error in scripts/lib/sd-id-resolver.js.
 *   - a5fc189f: stale-session-sweep.cjs reset current_phase even when an
 *               accepted EXEC-TO-PLAN/PLAN-TO-EXEC handoff existed past the
 *               target reset state — overwriting valid phase progress.
 *   - 28a71037: sd-start.js released the SD claim on a benign worktree-add
 *               conflict ("branch already used by worktree at <cwd>") even
 *               when the conflict path matched the SD's own expected worktree
 *               dir — should have re-attached, not released.
 *
 * The unifying root cause (rca-agent confidence 82, feedback 9d919889): the
 * harness treats a worktree as a stable execution context for the entire SD
 * lifecycle, but `gh pr merge --delete-branch` destroys that context mid-flight,
 * AND the harness writes canonical state without asserting its own execution
 * preconditions.
 *
 * Design constraints:
 *   - Pure functions where possible (assertCwdValid is sync; cleanup is impure).
 *   - All assertions throw ExecContextError on violation; callers catch and
 *     decide policy (skip, release, recover, etc.).
 *   - Reuses lib/protocol-policies/worktree-failure-classification.js
 *     (which itself wraps lib/worktree-manager.js::classifyWorktreeError) —
 *     do NOT introduce parallel classifiers.
 */

import { execSync } from 'child_process';
import { lstatSync } from 'fs';
import path from 'path';

/**
 * Error class for exec-context-guard violations. Carries a stable .code field
 * so RCA filters and downstream policy switches can match without regex.
 *
 * Codes:
 *   STALE_CWD                  — cwd is a worktree dir not in `git worktree list`
 *   ACCEPTED_HANDOFF_OVERRIDE  — sweep would override an accepted handoff
 *   WORKTREE_OWN_CONFLICT      — sd-start saw conflict path == SD's expected worktree
 *   WORKTREE_FOREIGN_CONFLICT  — sd-start saw conflict path != SD's expected worktree
 *   ORPHAN_WORKTREE_DETECTED   — gh merge --delete-branch left an orphaned worktree dir
 */
export class ExecContextError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ExecContextError';
    this.code = code;
    this.details = details;
  }
}

/**
 * FR-1, FR-2: assertCwdValid()
 *
 * Throws ExecContextError(STALE_CWD) when the current working directory is
 * NOT either:
 *   (a) the main repo root (cwd has .git as a directory), OR
 *   (b) a live worktree present in `git worktree list --porcelain`.
 *
 * Pure-ish: uses fs.lstatSync (junction-safe per worktree-manager.js precedent)
 * and a single `git worktree list --porcelain` shell call. No DB writes.
 *
 * Heartbeat-freshness escape hatch: if the caller passes
 * { allowFreshHeartbeat: true } AND a CLAUDE_SESSION_ID env is set, this
 * function does NOT enforce the worktree-list check (callers under cooperative
 * mode may legitimately operate from a transient cwd). The cwd-must-have-.git
 * check is still enforced.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd=process.cwd()]
 * @param {boolean} [opts.allowFreshHeartbeat=false]
 * @returns {{ok: true, kind: 'main'|'worktree', cwd: string}}
 * @throws {ExecContextError} STALE_CWD when cwd does not pass either check
 */
export function assertCwdValid(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const gitMarker = path.join(cwd, '.git');
  const stat = lstatSync(gitMarker, { throwIfNoEntry: false });

  if (!stat) {
    throw new ExecContextError(
      'STALE_CWD',
      `cwd has no .git marker: ${cwd}`,
      { cwd }
    );
  }

  // .git as a directory => main repo root. .git as a file => worktree dir
  // (contains "gitdir: <main>/.git/worktrees/<name>" pointer).
  if (stat.isDirectory()) {
    return { ok: true, kind: 'main', cwd };
  }

  // .git is a file (or symlink to file): worktree dir. Must be live.
  if (opts.allowFreshHeartbeat && process.env.CLAUDE_SESSION_ID) {
    return { ok: true, kind: 'worktree', cwd };
  }

  let listOutput;
  try {
    listOutput = execSync('git worktree list --porcelain', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new ExecContextError(
      'STALE_CWD',
      `git worktree list failed in ${cwd}: ${err.message}`,
      { cwd, gitError: err.message }
    );
  }

  // Parse porcelain: each entry begins with "worktree <path>". Match cwd to
  // any listed worktree path (exact match after path.resolve normalization).
  const cwdNorm = path.resolve(cwd);
  const listed = listOutput
    .split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => path.resolve(line.slice('worktree '.length).trim()));

  if (!listed.includes(cwdNorm)) {
    throw new ExecContextError(
      'STALE_CWD',
      `cwd is a worktree dir but not in 'git worktree list' — likely orphaned ` +
      `(branch was deleted via 'gh pr merge --delete-branch'): ${cwd}`,
      { cwd, listed }
    );
  }

  return { ok: true, kind: 'worktree', cwd };
}

/**
 * FR-3: assertSweepHandoffGate(supabase, sdKey, targetResetPhase)
 *
 * Async. Queries sd_phase_handoffs for accepted handoffs whose to_phase is
 * past the proposed target reset phase. If any exist, throws
 * ExecContextError(ACCEPTED_HANDOFF_OVERRIDE) — caller (stale-session-sweep)
 * MUST skip the current_phase reset.
 *
 * Generalizes QF-20260423-909 (which only protected PLAN-TO-LEAD) to all 4
 * handoff types. Coexists with FLEET-COORDINATION-RESILIENCE-001 PHASE_RESET_MAP
 * — does not change PHASE_RESET_MAP behavior, only adds a pre-check that
 * blocks the reset entirely when an accepted handoff would be overridden.
 *
 * Phase ordering used for "past target":
 *   LEAD < PLAN < EXEC (and PLAN_PRD is treated as PLAN)
 *
 * Handoff to_phase mapping (what counts as "past target=LEAD"):
 *   LEAD-TO-PLAN.to_phase    = PLAN  → past LEAD
 *   PLAN-TO-EXEC.to_phase    = EXEC  → past LEAD, past PLAN
 *   EXEC-TO-PLAN.to_phase    = PLAN  → past LEAD
 *   PLAN-TO-LEAD.to_phase    = LEAD  → not past LEAD
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdKey - SD key (e.g. SD-XXX-001)
 * @param {string} targetResetPhase - 'LEAD' | 'PLAN' | 'EXEC'
 * @returns {Promise<{ok: true}>}
 * @throws {ExecContextError} ACCEPTED_HANDOFF_OVERRIDE
 */
export async function assertSweepHandoffGate(supabase, sdKey, targetResetPhase) {
  const phaseRank = { LEAD: 0, PLAN: 1, PLAN_PRD: 1, EXEC: 2 };
  const targetRank = phaseRank[targetResetPhase];
  if (targetRank === undefined) {
    throw new ExecContextError(
      'ACCEPTED_HANDOFF_OVERRIDE',
      `Unknown targetResetPhase '${targetResetPhase}' — caller bug`,
      { sdKey, targetResetPhase }
    );
  }

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, from_phase, to_phase, status, created_at')
    .or(`sd_id.eq.${sdKey},sd_key.eq.${sdKey}`)
    .eq('status', 'accepted');

  if (error) {
    // Treat DB read failure as ALLOW (do not block sweep on transient DB
    // issues — sweep is itself a resilience layer). Caller logs the warning.
    return { ok: true, dbError: error.message };
  }

  const overriding = (data || []).filter(h => {
    const r = phaseRank[h.to_phase];
    return r !== undefined && r > targetRank;
  });

  if (overriding.length > 0) {
    throw new ExecContextError(
      'ACCEPTED_HANDOFF_OVERRIDE',
      `Sweep would reset ${sdKey} to ${targetResetPhase} but ${overriding.length} ` +
      `accepted handoff(s) exist past target: ` +
      overriding.map(h => `${h.from_phase}→${h.to_phase}@${h.created_at}`).join(', '),
      { sdKey, targetResetPhase, overriding }
    );
  }

  return { ok: true };
}

/**
 * FR-4: classifyWorktreeOwnership(conflictPath, expectedPath)
 *
 * Pure function. Given a worktree-add conflict path (from git error message
 * "branch '<x>' is already used by worktree at '<conflictPath>'") and the
 * SD's expected worktree dir, return whether the conflict is OWN (re-attach
 * is safe) or FOREIGN (release claim).
 *
 * Path comparison uses path.resolve to normalize separators / trailing slashes.
 *
 * @param {string} conflictPath
 * @param {string} expectedPath
 * @returns {{kind: 'own'|'foreign', conflictPath: string, expectedPath: string}}
 */
export function classifyWorktreeOwnership(conflictPath, expectedPath) {
  if (typeof conflictPath !== 'string' || typeof expectedPath !== 'string') {
    return { kind: 'foreign', conflictPath, expectedPath };
  }
  const a = path.resolve(conflictPath);
  const b = path.resolve(expectedPath);
  return {
    kind: a === b ? 'own' : 'foreign',
    conflictPath: a,
    expectedPath: b,
  };
}

/**
 * FR-5: detectOrphanWorktreeFromMerge(stdoutOrOutput)
 *
 * Pure detector. Scans gh-merge-safe.mjs / `gh pr merge --delete-branch`
 * stdout for the pattern indicating the branch was deleted, signalling that
 * any worktree pointing at that branch is now orphaned.
 *
 * Caller (post-merge-worktree-cleanup.js) uses the returned branch name to
 * locate and remove the orphaned worktree dir, gated by the
 * .claude/worktree-reaper-state.json lock to prevent races with the
 * worktree-reaper cron.
 *
 * @param {string} output - merge command stdout/stderr
 * @returns {{detected: boolean, branch: string|null}}
 */
export function detectOrphanWorktreeFromMerge(output) {
  if (typeof output !== 'string' || output.length === 0) {
    return { detected: false, branch: null };
  }
  // Match gh CLI output: "✓ Deleted branch <name>" or
  // "Deleted branch <name> (was <sha>)" from local + remote prune.
  const m = output.match(/Deleted (?:local )?branch ['"`]?([^'"`\s]+)['"`]?/i);
  if (!m) {
    return { detected: false, branch: null };
  }
  return { detected: true, branch: m[1] };
}
