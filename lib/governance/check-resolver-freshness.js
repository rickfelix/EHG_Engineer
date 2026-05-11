/**
 * QF-20260511-258 — Stale-branch guard for the post-merge feedback auto-resolver.
 *
 * Closes the recurrence class witnessed in QF-20260511-205 (and earlier via QF-122,
 * QF-556, QF-925, QF-228 manual-resolve precedents): when a worker branch is forked
 * BEFORE a resolver-relevant fix lands in main, complete-quick-fix.js runs the
 * STALE worker code at completion time and the auto-resolver silently no-ops.
 *
 * This check is narrowly scoped to commits that touch the actual resolver code paths
 * (orchestrator + parser/lib). Branches that are behind on unrelated commits are NOT
 * blocked — that would over-trigger on every long-lived branch.
 *
 * The general "behind main by N commits" warning lives in
 * scripts/hooks/concurrent-session-worktree.cjs::checkBranchFreshness (QF-228); this
 * file complements it with the resolver-specific gate. Both can fire on the same
 * branch; they answer different questions.
 */

import { execSync } from 'child_process';

/**
 * Paths whose commits on origin/main but NOT on HEAD invalidate the locally-loaded
 * resolver code. Each entry is a path passed to `git rev-list -- <path>`.
 *
 * Keep the list small and intentional. Files added here must be ones whose runtime
 * behavior changes the resolveLinkedFeedbackRows path inside complete-quick-fix.
 */
export const RESOLVER_RELEVANT_PATHS = [
  'scripts/modules/complete-quick-fix/orchestrator.js',
  'lib/governance/resolve-feedback.js',
];

/**
 * Check whether the worker's branch is stale relative to origin/main for the
 * resolver-relevant code paths.
 *
 * @param {string} testDir - Repo root to run git commands from.
 * @param {string} baseRef - Base ref to compare against (default 'origin/main').
 * @returns {{ behind: number, stale: boolean, paths: string[], commits: string[] }}
 *   behind: number of commits on origin/main touching the resolver paths that are
 *           not yet on HEAD. Zero is the good state.
 *   stale:  behind > 0.
 *   paths:  the RESOLVER_RELEVANT_PATHS list (echoed for caller diagnostics).
 *   commits: short SHAs of the offending commits (best-effort; empty on error).
 *
 * Best-effort: any git failure (no origin, no remote ref, etc.) returns
 * { behind: 0, stale: false, paths, commits: [] } so this check never blocks
 * a worker on infrastructure flakes. The general checkBranchFreshness handles the
 * "no origin/main known locally" case with its own banner.
 */
export function checkResolverFreshness(testDir, baseRef = 'origin/main') {
  const paths = RESOLVER_RELEVANT_PATHS;
  try {
    const cmd = `git rev-list HEAD..${baseRef} -- ${paths.map((p) => `"${p}"`).join(' ')}`;
    const raw = execSync(cmd, {
      cwd: testDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    const commits = raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((sha) => sha.substring(0, 7));
    const behind = commits.length;
    return { behind, stale: behind > 0, paths, commits };
  } catch {
    return { behind: 0, stale: false, paths, commits: [] };
  }
}

/**
 * Log a loud banner when a stale-resolver state is detected. Caller decides whether
 * to abort (default) or continue under operator override via --allow-stale-branch.
 *
 * @param {{ behind: number, paths: string[], commits: string[] }} result
 * @param {{ allowed: boolean, reason?: string }} bypass
 */
export function logResolverFreshnessBanner(result, bypass = { allowed: false }) {
  const { behind, paths, commits } = result;
  console.log('\n========================================');
  console.log('  STALE RESOLVER BRANCH DETECTED');
  console.log('========================================');
  console.log(`  Resolver-relevant commits on origin/main NOT on HEAD: ${behind}`);
  console.log('  Tracked paths:');
  for (const p of paths) console.log(`    - ${p}`);
  if (commits.length > 0) console.log(`  Offending commits (short SHA): ${commits.join(', ')}`);
  if (bypass.allowed) {
    console.log(`  ⚠️  --allow-stale-branch override active (reason="${bypass.reason || 'unspecified'}").`);
    console.log('  Proceeding — auto-resolver will likely no-op for this completion.');
  } else {
    console.log('  Refusing to proceed: completion would run STALE resolver code from this branch.');
    console.log('  Remediation:');
    console.log('    1. git fetch origin main && git merge origin/main   (or rebase)');
    console.log('    2. Re-run: node scripts/complete-quick-fix.js <QF-ID> ...');
    console.log('    3. (Audited bypass): add --allow-stale-branch --reason "<text>"');
  }
  console.log('========================================\n');
}
