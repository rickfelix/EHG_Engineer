import { execFileSync } from 'child_process';

/**
 * QF-20260703-758 stopgap: claim eligibility is enforced client-side (in the gate files
 * themselves), so a session running a checkout from BEFORE a gate fix was merged claims
 * straight through it. Refuses the claim when origin/main has commits touching a gate
 * file that HEAD does not have — i.e. this checkout is missing an upstream gate fix.
 *
 * Fail-open on any git error (network hiccup, no remote, etc.) — never blocks a
 * legitimate claim on a tooling failure.
 *
 * @param {string} repoRoot - main repo root (git cwd)
 * @param {string[]} gateFiles - repo-relative paths of the files enforcing claim gates
 * @returns {{stale: boolean, file?: string, missingCommitCount?: number, skipped?: boolean}}
 */
export function checkClaimGateFreshness(repoRoot, gateFiles) {
  try {
    execFileSync('git', ['fetch', 'origin', 'main', '--quiet'], { cwd: repoRoot, stdio: 'ignore', timeout: 15000 });
  } catch (e) {
    return { stale: false, skipped: true, reason: e.message };
  }
  for (const file of gateFiles) {
    try {
      const missing = execFileSync(
        'git', ['log', '--oneline', 'HEAD..origin/main', '--', file],
        { cwd: repoRoot, encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (missing) {
        return { stale: true, file, missingCommitCount: missing.split('\n').length };
      }
    } catch {
      // fail-open per file — a git error here must not block a legitimate claim
    }
  }
  return { stale: false };
}
