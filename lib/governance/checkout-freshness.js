/**
 * Checkout freshness guard — SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001.
 *
 * ONE reusable, FAIL-OPEN module that tells a worker/coordinator whether its local checkout is
 * stale vs the base ref — and crucially whether a PROTOCOL file (CLAUDE*.md) has drifted, which
 * means it is operating on stale rules. Generalizes the scattered patterns in
 * scripts/eva/git-freshness.js (behind-count) + lib/governance/check-resolver-freshness.js
 * (path-scoped diff). (The SD-named memory/adam-staleness-check.mjs does NOT exist — generalized
 * from the real modules.)
 *
 * Design: a PURE verdict fn (evaluateFreshness) + an injectable-IO reader (checkoutFreshness, SYNC
 * to match the sync callers). Verdict precedence: STALE-CRITICAL (>=1 protocol file drifted) >
 * STALE (behind > 0) > FRESH. EVERY git error fail-opens to FRESH — a freshness check must NEVER
 * block startup or an audit. `fetch` is opt-in (default off) so startup stays fast/offline-safe.
 *
 * @module lib/governance/checkout-freshness
 */

import { execSync } from 'node:child_process';

/** Canonical protocol files whose drift vs the base ref makes the checkout STALE-CRITICAL. */
export const CRITICAL_PROTOCOL_FILES = Object.freeze([
  'CLAUDE.md',
  'CLAUDE_CORE.md',
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md',
]);

export const VERDICT = Object.freeze({ FRESH: 'FRESH', STALE: 'STALE', STALE_CRITICAL: 'STALE-CRITICAL' });

/**
 * PURE verdict — no IO, fully testable from data alone.
 * @param {{behind?: number, criticalDiff?: string[]}} state
 * @param {{criticalThreshold?: number}} [opts]
 * @returns {{verdict: string, behind: number, criticalDiff: string[], reason: string}}
 *   Precedence: STALE-CRITICAL > STALE > FRESH.
 */
export function evaluateFreshness(state, opts = {}) {
  const behind = Number.isFinite(state?.behind) ? state.behind : 0;
  const criticalDiff = Array.isArray(state?.criticalDiff) ? state.criticalDiff : [];
  const critN = Number.isFinite(opts.criticalThreshold) ? opts.criticalThreshold : 1;
  if (criticalDiff.length >= critN && criticalDiff.length > 0) {
    return { verdict: VERDICT.STALE_CRITICAL, behind, criticalDiff, reason: `protocol file(s) drifted vs base: ${criticalDiff.join(', ')}` };
  }
  if (behind > 0) {
    return { verdict: VERDICT.STALE, behind, criticalDiff, reason: `behind base by ${behind} commit(s)` };
  }
  return { verdict: VERDICT.FRESH, behind, criticalDiff, reason: 'up to date with base' };
}

/**
 * Default git runner — the injectable IO seam. SYNC (execSync), stdio piped (no output bleed),
 * timeout-bounded. Path quoting uses double-quotes (works on both POSIX shells and Windows cmd).
 */
export function makeGit({ cwd = process.cwd(), remote = 'origin', timeout = 10000 } = {}) {
  const run = (cmd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout });
  return {
    fetch: (baseRef) => run(`git fetch ${remote} ${String(baseRef).replace(`${remote}/`, '')} --quiet`),
    behindCount: (baseRef) => {
      const n = parseInt(run(`git rev-list --count HEAD..${baseRef}`).trim(), 10);
      return Number.isFinite(n) ? n : 0;
    },
    diffPaths: (baseRef, paths) => {
      if (!paths || paths.length === 0) return [];
      const quoted = paths.map((p) => `"${p}"`).join(' ');
      const raw = run(`git diff --name-only HEAD...${baseRef} -- ${quoted}`);
      return raw.split('\n').map((s) => s.trim()).filter(Boolean);
    },
  };
}

/**
 * Injectable-IO entry. SYNC. Reads git state then delegates to evaluateFreshness.
 * FAIL-OPEN: ANY git error returns { verdict:'FRESH', behind:0, criticalDiff:[], error } so it can
 * never block a caller.
 *
 * @param {string} [cwd=process.cwd()] repo root for git commands
 * @param {object} [config]
 *   baseRef='origin/main' | remote='origin' | timeout=10000
 *   criticalPaths=CRITICAL_PROTOCOL_FILES (override e.g. resolver paths)
 *   fetch=false (opt-in network; default trusts the local origin ref)
 *   role='fleet' (log context only) | criticalThreshold=1
 *   git=makeGit(...) (INJECTED SEAM: {fetch, behindCount, diffPaths})
 * @returns {{verdict, behind, criticalDiff, paths, baseRef, role, checkedAt, error?, reason}}
 */
export function checkoutFreshness(cwd = process.cwd(), config = {}) {
  const baseRef = config.baseRef || 'origin/main';
  const remote = config.remote || 'origin';
  const timeout = config.timeout || 10000;
  const paths = config.criticalPaths || CRITICAL_PROTOCOL_FILES;
  const role = config.role || 'fleet';
  const git = config.git || makeGit({ cwd, remote, timeout });
  const checkedAt = new Date().toISOString();
  try {
    if (config.fetch) {
      try { git.fetch(baseRef); } catch { /* a fetch flake is non-fatal; fall back to the local ref */ }
    }
    const behind = git.behindCount(baseRef);
    const criticalDiff = git.diffPaths(baseRef, paths);
    const v = evaluateFreshness({ behind, criticalDiff }, config);
    return { ...v, paths, baseRef, role, checkedAt };
  } catch (err) {
    return {
      verdict: VERDICT.FRESH, behind: 0, criticalDiff: [], paths, baseRef, role, checkedAt,
      error: err?.message || String(err), reason: 'git error (fail-open -> FRESH)',
    };
  }
}

/** One-line advisory badge for startup banners / audit lines. Never throws. */
export function freshnessBadge(result) {
  const v = result?.verdict || VERDICT.FRESH;
  const icon = v === VERDICT.FRESH ? '✅' : v === VERDICT.STALE_CRITICAL ? '🛑' : '⚠️';
  const base = result?.baseRef || 'origin/main';
  let tail;
  if (result?.error) tail = `git error (${result.error}) — treated FRESH`;
  else if (v === VERDICT.FRESH) tail = `up to date vs ${base}`;
  else if (v === VERDICT.STALE_CRITICAL) tail = `PROTOCOL DRIFT: ${(result.criticalDiff || []).join(', ')} — run \`git pull\` before trusting local rules`;
  else tail = `behind ${base} by ${result.behind} commit(s) — run \`git pull\``;
  return `[${icon} ${v}] Checkout freshness — ${tail}`;
}

export default { CRITICAL_PROTOCOL_FILES, VERDICT, evaluateFreshness, makeGit, checkoutFreshness, freshnessBadge };
